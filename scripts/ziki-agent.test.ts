import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ApiError,
  backoffMs,
  budgetPauseMs,
  configPath,
  loadConfig,
  main,
  makeContext,
  pair,
  retryAfterMs,
  saveConfig,
  watch,
} from "./ziki-agent.mjs";

const BASE = "https://ziki.test";

type Reply = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};
type Call = {
  method: string;
  path: string;
  search: string;
  headers: Record<string, string>;
  body: unknown;
};

/** Replies per "METHOD /path". The last reply for a route repeats. */
function fakeApi(routes: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const fetchFn = async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({
      method,
      path: url.pathname,
      search: url.search,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const queue = routes[`${method} ${url.pathname}`];
    if (!queue?.length)
      throw new Error(`unexpected request: ${method} ${url.pathname}`);
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  };
  return { fetchFn, calls };
}

function testContext(
  fetchFn:
    | typeof fetch
    | ((input: unknown, init?: RequestInit) => Promise<Response>),
) {
  const sleeps: number[] = [];
  const logs: string[] = [];
  const out: string[] = [];
  const opened: string[] = [];
  const ctx = makeContext({
    fetch: fetchFn,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    now: () => Date.parse("2026-10-20T12:00:00Z"),
    log: (line: string) => logs.push(line),
    out: (line: string) => out.push(line),
    openUrl: (link: string) => opened.push(link),
  });
  return { ctx, sleeps, logs, out, opened };
}

let dir: string;
let configFile: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ziki-agent-"));
  configFile = path.join(dir, "agent.json");
});

const pairingStart = {
  user_code: "ABCD-1234",
  device_code: "dvc_secret",
  verification_uri: `${BASE}/settings/agents/pair`,
  verification_uri_complete: `${BASE}/settings/agents/pair?code=ABCD-1234`,
  expires_at: "2026-10-20T12:10:00.000Z",
  interval: 5,
};
const pairingDone = {
  api_key: "zk_live_supersecret",
  key_prefix: "zk_live_",
  agent: { id: "agent_1", name: "Ada's Claude" },
  project_id: "project_1",
};

async function savedConfig(extra: Record<string, unknown> = {}) {
  await saveConfig(configFile, {
    url: BASE,
    apiKey: "zk_live_key",
    name: "Ada's Claude",
    cursor: null,
    ...extra,
  });
}

describe("config file", () => {
  it("honours ZIKI_AGENT_CONFIG, then XDG_CONFIG_HOME, then ~/.config", () => {
    expect(configPath({ ZIKI_AGENT_CONFIG: "/x/agent.json" })).toBe(
      "/x/agent.json",
    );
    expect(configPath({ XDG_CONFIG_HOME: "/xdg" })).toBe(
      path.join("/xdg", "ziki", "agent.json"),
    );
    expect(configPath({})).toBe(
      path.join(os.homedir(), ".config", "ziki", "agent.json"),
    );
  });

  it("returns null when there is no file yet", async () => {
    expect(await loadConfig(configFile)).toBeNull();
  });

  it("round-trips and keeps the file owner-only", async () => {
    await saveConfig(configFile, { apiKey: "k", cursor: "c1" });
    expect(await loadConfig(configFile)).toEqual({ apiKey: "k", cursor: "c1" });
    if (process.platform !== "win32") {
      expect((await stat(configFile)).mode & 0o777).toBe(0o600);
    }
  });
});

describe("rate-limit helpers", () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it("reads Retry-After as seconds or an HTTP date", () => {
    expect(retryAfterMs(headers({ "retry-after": "7" }))).toBe(7000);
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(
      retryAfterMs(
        headers({ "retry-after": "Tue, 20 Oct 2026 12:00:30 GMT" }),
        now,
      ),
    ).toBe(30_000);
    expect(retryAfterMs(headers({}))).toBeNull();
  });

  it("pauses only when the budget header says nothing is left", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(
      budgetPauseMs(
        headers({ "x-ratelimit-remaining": "3", "x-ratelimit-reset": "60" }),
        now,
      ),
    ).toBeNull();
    expect(
      budgetPauseMs(
        headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "60" }),
        now,
      ),
    ).toBe(60_000);
    const epoch = String(now / 1000 + 90);
    expect(
      budgetPauseMs(
        headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": epoch }),
        now,
      ),
    ).toBe(90_000);
    expect(budgetPauseMs(headers({}), now)).toBeNull();
  });

  it("backs off 1s, 2s, 4s and stops growing at 60s", () => {
    expect([0, 1, 2].map(backoffMs)).toEqual([1000, 2000, 4000]);
    expect(backoffMs(20)).toBe(60_000);
  });
});

describe("pair", () => {
  it("polls until approved, stores the key owner-only and never prints it", async () => {
    const { fetchFn, calls } = fakeApi({
      "POST /api/v1/agents/pairing": [{ status: 201, body: pairingStart }],
      "POST /api/v1/agents/pairing/token": [
        { status: 400, body: { error: "authorization_pending" } },
        { status: 400, body: { error: "authorization_pending" } },
        { status: 200, body: pairingDone },
      ],
      "GET /api/v1/agents/me": [
        { body: { id: "agent_1", name: "Ada's Claude" } },
      ],
    });
    const { ctx, sleeps, logs, opened } = testContext(fetchFn);

    const config = await pair(ctx, {
      name: "Ada's Claude",
      model: "Claude",
      url: BASE,
      configFile,
    });

    expect(calls[0].body).toEqual({ name: "Ada's Claude", model: "Claude" });
    expect(opened).toEqual([pairingStart.verification_uri_complete]);
    expect(sleeps.slice(0, 3)).toEqual([5000, 5000, 5000]);
    expect(config).toMatchObject({
      url: BASE,
      apiKey: "zk_live_supersecret",
      agentId: "agent_1",
      projectId: "project_1",
    });
    expect(await loadConfig(configFile)).toMatchObject({
      apiKey: "zk_live_supersecret",
      cursor: null,
    });
    const me = calls.find((call) => call.path === "/api/v1/agents/me");
    expect(me?.headers.Authorization).toBe("Bearer zk_live_supersecret");
    const printed = logs.join("\n");
    expect(printed).toContain("ABCD-1234");
    expect(printed).not.toContain("zk_live_supersecret");
    expect(printed).not.toContain("dvc_secret");
  });

  it("does not open a browser with --no-open", async () => {
    const { fetchFn } = fakeApi({
      "POST /api/v1/agents/pairing": [{ status: 201, body: pairingStart }],
      "POST /api/v1/agents/pairing/token": [{ body: pairingDone }],
      "GET /api/v1/agents/me": [{ body: {} }],
    });
    const { ctx, opened } = testContext(fetchFn);
    await pair(ctx, { name: "Ada", url: BASE, open: false, configFile });
    expect(opened).toEqual([]);
  });

  it("slows down on 429 and waits the Retry-After time", async () => {
    const { fetchFn } = fakeApi({
      "POST /api/v1/agents/pairing": [{ status: 201, body: pairingStart }],
      "POST /api/v1/agents/pairing/token": [
        {
          status: 429,
          body: { error: "slow_down" },
          headers: { "Retry-After": "12" },
        },
        { body: pairingDone },
      ],
      "GET /api/v1/agents/me": [{ body: {} }],
    });
    const { ctx, sleeps } = testContext(fetchFn);
    await pair(ctx, { name: "Ada", url: BASE, configFile });
    expect(sleeps.slice(0, 3)).toEqual([5000, 12_000, 10_000]);
  });

  it("fails without saving anything when the pairing expires", async () => {
    const { fetchFn } = fakeApi({
      "POST /api/v1/agents/pairing": [{ status: 201, body: pairingStart }],
      "POST /api/v1/agents/pairing/token": [
        { status: 400, body: { error: "expired_token" } },
      ],
    });
    const { ctx } = testContext(fetchFn);
    await expect(
      pair(ctx, { name: "Ada", url: BASE, configFile }),
    ).rejects.toThrow(/expired/);
    expect(await loadConfig(configFile)).toBeNull();
  });

  it("needs a name", async () => {
    const { ctx } = testContext(async () => new Response("{}"));
    await expect(
      pair(ctx, { name: "", url: BASE, configFile }),
    ).rejects.toThrow(/--name/);
  });
});

describe("watch", () => {
  const event = (id: string, type: string) => ({
    id,
    type,
    payload: {},
    bugId: "issue_1",
    createdAt: "2026-10-20T12:00:00Z",
  });

  it("resumes from the saved cursor, prints events and saves the new cursor", async () => {
    await savedConfig({ cursor: "cur1" });
    const { fetchFn, calls } = fakeApi({
      "GET /api/v1/events": [
        {
          body: {
            events: [
              event("e1", "claim.offered"),
              event("e2", "comment.created"),
            ],
            cursor: "cur2",
            hasMore: false,
          },
        },
      ],
    });
    const { ctx, out } = testContext(fetchFn);

    await watch(ctx, { configFile, maxPolls: 1 });

    expect(calls[0].search).toBe("?after=cur1&wait=25");
    expect(calls[0].headers.Authorization).toBe("Bearer zk_live_key");
    expect(out.map((line) => JSON.parse(line).id)).toEqual(["e1", "e2"]);
    expect((await loadConfig(configFile)).cursor).toBe("cur2");
  });

  it("keeps only the event types asked for", async () => {
    await savedConfig({ cursor: "cur1" });
    const { fetchFn } = fakeApi({
      "GET /api/v1/events": [
        {
          body: {
            events: [
              event("e1", "claim.offered"),
              event("e2", "comment.created"),
            ],
            cursor: "cur2",
            hasMore: false,
          },
        },
      ],
    });
    const { ctx, out } = testContext(fetchFn);
    await watch(ctx, { configFile, types: ["claim.offered"], maxPolls: 1 });
    expect(out.map((line) => JSON.parse(line).id)).toEqual(["e1"]);
  });

  it("skips existing history on the first run and stores where it got to", async () => {
    await savedConfig();
    const { fetchFn, calls } = fakeApi({
      "GET /api/v1/events": [
        {
          body: {
            events: [event("old1", "issue.created")],
            cursor: "page1",
            hasMore: true,
          },
        },
        {
          body: {
            events: [event("old2", "issue.created")],
            cursor: "page2",
            hasMore: false,
          },
        },
        {
          body: {
            events: [event("new1", "claim.offered")],
            cursor: "page3",
            hasMore: false,
          },
        },
      ],
    });
    const { ctx, out } = testContext(fetchFn);

    await watch(ctx, { configFile, maxPolls: 1 });

    expect(calls.map((call) => call.search)).toEqual([
      "",
      "?after=page1",
      "?after=page2&wait=25",
    ]);
    expect(out.map((line) => JSON.parse(line).id)).toEqual(["new1"]);
    expect((await loadConfig(configFile)).cursor).toBe("page3");
  });

  it("handles history on the first run with --replay", async () => {
    await savedConfig();
    const { fetchFn, calls } = fakeApi({
      "GET /api/v1/events": [
        {
          body: {
            events: [event("old1", "issue.created")],
            cursor: "page1",
            hasMore: false,
          },
        },
      ],
    });
    const { ctx, out } = testContext(fetchFn);
    await watch(ctx, { configFile, replay: true, maxPolls: 1 });
    expect(calls[0].search).toBe("?wait=25");
    expect(out).toHaveLength(1);
  });

  it("waits Retry-After on a 429 and then carries on", async () => {
    await savedConfig({ cursor: "cur1" });
    const { fetchFn, calls } = fakeApi({
      "GET /api/v1/events": [
        {
          status: 429,
          body: { error: "slow down" },
          headers: { "Retry-After": "42" },
        },
        {
          body: {
            events: [event("e1", "claim.offered")],
            cursor: "cur2",
            hasMore: false,
          },
        },
      ],
    });
    const { ctx, sleeps, out } = testContext(fetchFn);
    await watch(ctx, { configFile, maxPolls: 1 });
    expect(calls).toHaveLength(2);
    expect(sleeps[0]).toBe(42_000);
    expect(out).toHaveLength(1);
  });

  it("backs off on server errors", async () => {
    await savedConfig({ cursor: "cur1" });
    const { fetchFn } = fakeApi({
      "GET /api/v1/events": [
        { status: 503, body: {} },
        { status: 502, body: {} },
        { body: { events: [], cursor: "cur1", hasMore: false } },
      ],
    });
    const { ctx, sleeps } = testContext(fetchFn);
    await watch(ctx, { configFile, maxPolls: 1 });
    expect(sleeps.slice(0, 2)).toEqual([1000, 2000]);
  });

  it("pauses when the read budget header says it is spent", async () => {
    await savedConfig({ cursor: "cur1" });
    const { fetchFn } = fakeApi({
      "GET /api/v1/events": [
        {
          headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "300" },
          body: { events: [], cursor: "cur1", hasMore: false },
        },
      ],
    });
    const { ctx, sleeps } = testContext(fetchFn);
    await watch(ctx, { configFile, maxPolls: 1 });
    expect(sleeps[0]).toBe(300_000);
  });

  it("stops at once on a 401 and asks for a new pairing", async () => {
    await savedConfig({ cursor: "cur1" });
    const { fetchFn, calls } = fakeApi({
      "GET /api/v1/events": [{ status: 401, body: { error: "Unauthorized" } }],
    });
    const { ctx } = testContext(fetchFn);
    const run = watch(ctx, { configFile, maxPolls: 1 });
    await expect(run).rejects.toBeInstanceOf(ApiError);
    await expect(run).rejects.toThrow(/pair/);
    expect(calls).toHaveLength(1);
  });

  it("clamps wait to the 0-25 second range the API allows", async () => {
    await savedConfig({ cursor: "cur1" });
    const { fetchFn, calls } = fakeApi({
      "GET /api/v1/events": [
        { body: { events: [], cursor: "cur1", hasMore: false } },
      ],
    });
    const { ctx } = testContext(fetchFn);
    await watch(ctx, { configFile, wait: 99, maxPolls: 1 });
    await watch(ctx, { configFile, wait: 0, maxPolls: 1 });
    expect(calls[0].search).toBe("?after=cur1&wait=25");
    expect(calls[1].search).toBe("?after=cur1");
  });

  it("tells you to pair first when there is no key", async () => {
    const { ctx } = testContext(async () => new Response("{}"));
    await expect(watch(ctx, { configFile, maxPolls: 1 })).rejects.toThrow(
      /pair/,
    );
  });

  it("hands each event to --exec on stdin, with the key file but not the key in its environment", async () => {
    await savedConfig({ cursor: "cur1" });
    const outFile = path.join(dir, "received.json");
    const helper = path.join(dir, "helper.mjs");
    await writeFile(
      helper,
      [
        'import { readFileSync, writeFileSync } from "node:fs";',
        "writeFileSync(process.env.RECEIVED, JSON.stringify({",
        '  stdin: readFileSync(0, "utf8"),',
        "  type: process.env.ZIKI_EVENT_TYPE,",
        "  issue: process.env.ZIKI_ISSUE_ID,",
        "  config: process.env.ZIKI_AGENT_CONFIG,",
        "  url: process.env.ZIKI_URL,",
        "  hasKey: JSON.stringify(process.env).includes('zk_live_key'),",
        "}));",
      ].join("\n"),
    );
    const { fetchFn } = fakeApi({
      "GET /api/v1/events": [
        {
          body: {
            events: [event("e1", "claim.offered")],
            cursor: "cur2",
            hasMore: false,
          },
        },
      ],
    });
    const { ctx } = testContext(fetchFn);
    const previous = process.env.RECEIVED;
    process.env.RECEIVED = outFile;
    try {
      // makeContext's default runner (a real shell) is what is under test here.
      const real = makeContext();
      ctx.runCommand = real.runCommand;
      await watch(ctx, { configFile, exec: `node "${helper}"`, maxPolls: 1 });
    } finally {
      if (previous === undefined) delete process.env.RECEIVED;
      else process.env.RECEIVED = previous;
    }

    const received = JSON.parse(await readFile(outFile, "utf8"));
    expect(JSON.parse(received.stdin)).toMatchObject({
      id: "e1",
      type: "claim.offered",
    });
    expect(received).toMatchObject({
      type: "claim.offered",
      issue: "issue_1",
      config: configFile,
      url: BASE,
      hasKey: false,
    });
  });

  it("keeps going when the command fails", async () => {
    await savedConfig({ cursor: "cur1" });
    const { fetchFn } = fakeApi({
      "GET /api/v1/events": [
        {
          body: {
            events: [
              event("e1", "claim.offered"),
              event("e2", "claim.offered"),
            ],
            cursor: "cur2",
            hasMore: false,
          },
        },
      ],
    });
    const { ctx, logs } = testContext(fetchFn);
    const seen: string[] = [];
    ctx.runCommand = async (_command: string, ev: { id: string }) => {
      seen.push(ev.id);
      return 3;
    };
    await watch(ctx, { configFile, exec: "anything", maxPolls: 1 });
    expect(seen).toEqual(["e1", "e2"]);
    expect(logs.join("\n")).toMatch(/exited 3/);
    expect((await loadConfig(configFile)).cursor).toBe("cur2");
  });
});

describe("command line", () => {
  it("prints help and succeeds for help, fails with no command", async () => {
    const { ctx, out } = testContext(async () => new Response("{}"));
    expect(await main(["help"], ctx)).toBe(0);
    expect(await main([], ctx)).toBe(1);
    expect(out.join("\n")).toContain("ziki-agent");
  });

  it("reports an unknown command", async () => {
    const { ctx, logs } = testContext(async () => new Response("{}"));
    expect(await main(["nope"], ctx)).toBe(1);
    expect(logs.join("\n")).toContain('Unknown command "nope"');
  });

  it("returns a failing exit code and a message when pair has no name", async () => {
    const { ctx, logs } = testContext(async () => new Response("{}"));
    expect(await main(["pair", "--config", configFile], ctx)).toBe(1);
    expect(logs.join("\n")).toContain("--name");
  });
});
