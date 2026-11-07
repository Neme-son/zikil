import type { WorkTrack } from "@prisma/client";
import type { AgentContext } from "@/lib/agents/require-agent";
import { workEtag, workFeed, type FeedProject, type WorkFeed } from "@/lib/agent-api/work";
import { eventStreamBus, ORGANISATION_WRITE, type StreamEvent } from "@/lib/events/stream-bus";

/**
 * The work feed as a live stream (#work-feed-push).
 *
 * An agent that can hold a connection reads `GET /<org>/<project>/work` with
 * `Accept: text/event-stream` and gets the feed as Server-Sent Events: the
 * current feed first, then a new one every time it changes. Each event's id is
 * the feed's ETag, so a client that reconnects with `Last-Event-ID` gets the
 * same answer it would get from a poll with `If-None-Match`.
 *
 * The stream is a convenience, never the source of truth: the feed itself is
 * still read over HTTP, and an ETag decides whether anything changed. A
 * dropped connection, a missed event or a write that landed on another
 * instance costs a later poll, never a wrong answer.
 */

/** How long one stream stays open before the client reconnects. */
export const WORK_STREAM_MAX_MS = 5 * 60_000;
/** Keeps the connection, and any proxy in front of it, from going quiet. */
export const WORK_STREAM_HEARTBEAT_MS = 15_000;
/** How long a burst of writes settles before the stream reads the feed again. */
const WORK_STREAM_SETTLE_MS = 250;

/** One SSE frame. `event` is the type, `id` the feed ETag, `data` the JSON. */
function frame(event: string, id: string | null, data: unknown): string {
  const lines = [`event: ${event}`];
  if (id) lines.push(`id: ${id}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  return `${lines.join("\n")}\n\n`;
}

/**
 * The streaming response for one agent's work feed. The caller has already
 * read the feed once to authenticate the agent and charge its read; this sends
 * that same feed again as the first frame, then every change after it.
 */
export function workFeedStream(options: {
  agent: AgentContext;
  project: FeedProject;
  request: Request;
  /** The ETag the client last saw, from `Last-Event-ID`. */
  lastEventId?: string | null;
  /** Which track's feed to stream. Defaults to the product feed. */
  track?: WorkTrack;
  /** How the feed is read. The default is the real feed. */
  readFeed?: () => Promise<WorkFeed>;
}): Response {
  const { agent, project, request, lastEventId, track = "product", readFeed = () => workFeed(agent, project, track) } = options;
  const encoder = new TextEncoder();
  let stop: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let heartbeat: NodeJS.Timeout | null = null;
      let maxTimer: NodeJS.Timeout | null = null;
      let settleTimer: NodeJS.Timeout | null = null;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (maxTimer) clearTimeout(maxTimer);
        if (settleTimer) clearTimeout(settleTimer);
        eventStreamBus.off("event", onEvent);
        eventStreamBus.off(ORGANISATION_WRITE, onOrganisationWrite);
        request.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      let etag: string | null = null;
      const publish = async (initial = false) => {
        const feed = await readFeed();
        const next = workEtag(feed);
        if (next === etag) return;
        etag = next;
        // A client that reconnects with the last ETag it saw already holds
        // this feed, so it waits for the next one instead of reading it again.
        if (initial && lastEventId && next === lastEventId) return;
        send(frame("feed", next, feed));
      };

      const onSignal = () => {
        if (closed || settleTimer) return;
        // A burst settles first, so a busy workspace costs one feed read, not
        // one per write.
        settleTimer = setTimeout(() => {
          settleTimer = null;
          void publish().catch(() => close());
        }, WORK_STREAM_SETTLE_MS);
      };
      const onEvent = (event: StreamEvent) => {
        if (event.organisationId === agent.organisationId) onSignal();
      };
      const onOrganisationWrite = (organisationId: string) => {
        if (organisationId === agent.organisationId) onSignal();
      };

      heartbeat = setInterval(() => send(": ping\n\n"), WORK_STREAM_HEARTBEAT_MS);
      // A stream that never ends keeps a connection and its memory forever, so
      // it closes on its own and the client reconnects.
      maxTimer = setTimeout(() => close(), WORK_STREAM_MAX_MS);
      eventStreamBus.on("event", onEvent);
      eventStreamBus.on(ORGANISATION_WRITE, onOrganisationWrite);
      request.signal.addEventListener("abort", close);
      stop = close;

      try {
        await publish(true);
      } catch {
        close();
      }
    },
    cancel() {
      stop?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      // Proxies that buffer would hold the frames until the stream ends.
      "X-Accel-Buffering": "no",
    },
  });
}
