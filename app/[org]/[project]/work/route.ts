import { NextResponse, type NextRequest } from "next/server";
import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { agentIssueRequest, IssueApiError } from "@/lib/agent-api/issues";
import { workEtag, workFeed, parseWait, waitForWorkChange } from "@/lib/agent-api/work";
import { workFeedStream } from "@/lib/agent-api/work-stream";
import { parseTrackFilter } from "@/lib/marketing/track";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /<org>/<project>/work — everything this agent can do in the project, in
 * one list (#work-feed). It is the one place agents watch for work: ideas to
 * give an opinion on, offers addressed to it, its claims, fixes to test,
 * issues to take, research jobs, and manager and merger tasks marked with the
 * class they need.
 *
 * Query parameters:
 * - `track` — "product" (default) or "marketing". Anything else answers 400.
 *
 * Poll it about every `pollAfterSeconds` with `If-None-Match`; an unchanged
 * feed answers 304 with no body. Each call spends one read from the agent's
 * budget.
 *
 * Two ways to be told about work sooner (#work-feed-push), on the same URL:
 *
 * - `?wait=0..25` holds the request open until the feed changes, then answers
 *   with it (or 304 when the deadline passes with nothing new).
 * - `Accept: text/event-stream` streams the feed as Server-Sent Events: the
 *   current feed first, then a new one per change, each with the feed's ETag
 *   as its id.
 *
 * Both are conveniences over the same feed: the ETag still decides whether
 * anything changed, so a missed signal costs a later poll, never a wrong
 * answer.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ org: string; project: string }> }) {
  const { org, project: slug } = await context.params;
  return agentIssueRequest(request, "work.read", "read", null, async (agent) => {
    const project = await prisma.project.findFirst({
      // The slug is the URL people share; the MCP and CLI tools pass the project id they hold.
      where: { organisationId: agent.organisationId, organisation: { slug: decodeURIComponent(org) }, OR: [{ slug: decodeURIComponent(slug) }, { id: slug }] },
      select: { id: true, slug: true, name: true, organisation: { select: { slug: true } } },
    });
    if (!project) throw new IssueApiError(404, "Project not found.");
    // A key issued for one project cannot read another's work (#742).

    const trackResult = parseTrackFilter(request.nextUrl.searchParams.get("track"));
    if (!trackResult.ok) {
      throw new IssueApiError(400, trackResult.message, {
        error: "invalid_request",
        message: trackResult.message,
        field: "track",
      });
    }
    const track = trackResult.track;

    const feedProject = { id: project.id, slug: project.slug, name: project.name, orgSlug: project.organisation.slug };
    const clientEtag = request.headers.get("if-none-match");
    const lastEventId = request.headers.get("last-event-id");

    if (wantsEventStream(request)) {
      // A client that reconnects with the last ETag it saw already has that
      // feed: it waits for the next one instead of reading this one again.
      return workFeedStream({ agent, project: feedProject, request, lastEventId, track });
    }

    const wait = parseWait(request.nextUrl.searchParams.get("wait"));
    let feed = await workFeed(agent, feedProject, track);
    let etag = workEtag(feed);

    if (wait > 0 && clientEtag && clientEtag === etag) {
      // The agent already holds this feed. Hold the request until it changes.
      const changed = await waitForWorkChange(agent.organisationId, etag, wait, async () => workEtag(await workFeed(agent, feedProject, track)));
      if (changed) {
        feed = await workFeed(agent, feedProject, track);
        etag = workEtag(feed);
      }
    }

    if (clientEtag === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    return NextResponse.json(feed, { headers: { ETag: etag } });
  });
}

/** A client that asks for an event stream gets one, whatever else it accepts. */
function wantsEventStream(request: NextRequest): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.split(",").some((part) => part.trim().toLowerCase().startsWith("text/event-stream"));
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "HEAD", "OPTIONS"]);
const apiOptions = createOptions(["GET", "HEAD", "OPTIONS"]);
export const POST = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
