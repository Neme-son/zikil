import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue revalidation (#revalidation): a reported change asks an independent
 * agent to re-check the issues whose files or endpoints it touched, the answer
 * is recorded once per issue per commit, and none of it ever moves the issue.
 */

const db = vi.hoisted(() => {
  const client = {
    project: { findFirst: vi.fn() },
    bug: { findFirst: vi.fn() },
    issueRepro: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    issueRevalidation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    agentAuditEvent: { create: vi.fn() },
    agentInboxItem: { createMany: vi.fn() },
    $transaction: vi.fn(),
  };
  client.$transaction.mockImplementation(async (run: (tx: typeof client) => unknown) => run(client));
  return client;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const events = vi.hoisted(() => ({ publish: vi.fn(async () => ({ id: "event-1" })) }));
vi.mock("@/lib/agent-api/events", () => ({ publish: events.publish }));

import type { AgentContext } from "@/lib/agents/require-agent";
import { areaMatches, matchedAreas, ownFix } from "@/lib/revalidation";
import { giveRevalidation, reportCodeChange } from "@/lib/agent-api/revalidation";

function agent(agentId: string, ownerId = "ada"): AgentContext {
  return { agentId, name: agentId, ownerId, tenantId: "tenant-1", level: "working", burst: false, keyId: `key-${agentId}` };
}

const scope = { tenantId: "tenant-1", projectId: "project-1" };
const PR = "https://github.com/emerjent/ziki/pull/900";
const SHA = "9f2c1ab34de5";

/** An issue as the re-check reads it: open, unclaimed, with no pull request of its own. */
function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: "bug1",
    tenantId: "tenant-1",
    projectId: "project-1",
    number: 1,
    title: "Filters forget their state",
    status: "open",
    substatus: "open",
    isDeleted: false,
    pullRequestUrl: null,
    beneficiaryUserId: "ada",
    reporterId: "ada",
    assigneeId: null,
    createdByAgent: null,
    claims: [],
    ...overrides,
  };
}

/** A stored re-check, as the routes return it after a verdict. */
function stored(overrides: Record<string, unknown> = {}) {
  const who = { name: "ada" };
  return {
    id: "rev1",
    bugId: "bug1",
    trigger: "pull_request",
    pullRequestUrl: PR,
    commitSha: SHA,
    changedPaths: ["lib/agent-api/work.ts"],
    matchedPaths: ["lib/agent-api"],
    verdict: "possibly_fixed",
    summary: "Filters keep their state now.",
    description: "Followed the profile: the filter query survives a reload.",
    agentId: "reporter",
    onBehalfOfUserId: "ada",
    verdictAgentId: "fresh",
    verdictOnBehalfOfUserId: "dana",
    verdictAt: new Date("2026-11-06T10:00:00Z"),
    createdAt: new Date("2026-11-05T10:00:00Z"),
    updatedAt: new Date("2026-11-06T10:00:00Z"),
    agent: who,
    onBehalfOf: who,
    verdictAgent: { name: "fresh" },
    verdictOnBehalfOf: { name: "dana" },
    ...overrides,
  };
}

/** One issue's repro profile, as the change report matches it. */
function repro(bug: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    bugId: bug.id,
    affectedPaths: ["lib/agent-api"],
    affectedEndpoints: [],
    bug: { tenantId: "tenant-1", pullRequestUrl: null, status: "open", substatus: "open", ...bug },
    ...overrides,
  };
}

const change = (overrides: Record<string, unknown> = {}) => ({
  commitSha: SHA,
  changedPaths: ["lib/agent-api/work.ts"],
  ...overrides,
});

describe("matching a change to an issue's area", () => {
  it("matches a path and everything under it, never a name that only starts the same way", () => {
    expect(areaMatches("lib/agent-api", "lib/agent-api/work.ts")).toBe(true);
    expect(areaMatches("lib/agent-api/work.ts", "lib/agent-api/work.ts")).toBe(true);
    expect(areaMatches("lib/reval.ts", "lib/revalidation.ts")).toBe(false);
    expect(areaMatches("app/*/page.tsx", "app/issues/page.tsx")).toBe(true);
  });

  it("reads an endpoint as the area before its first value segment", () => {
    const profile = { affectedPaths: [], affectedEndpoints: ["POST /api/v1/issues/:id/revalidation"] };
    expect(matchedAreas(profile, ["app/api/v1/issues/[id]/revalidation/route.ts"])).toEqual([
      "POST /api/v1/issues/:id/revalidation",
    ]);
    expect(matchedAreas(profile, ["lib/revalidation.ts"])).toEqual([]);
  });

  it("takes an issue's own pull request as its fix, not as a reason to re-check", () => {
    expect(ownFix(PR, PR)).toBe(true);
    expect(ownFix(PR, "https://github.com/emerjent/ziki/pull/901")).toBe(false);
    expect(ownFix(null, PR)).toBe(false);
  });
});

describe("reporting a code change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.project.findFirst.mockResolvedValue({ id: "project-1" });
    db.issueRevalidation.findUnique.mockResolvedValue(null);
    db.issueRevalidation.create.mockResolvedValue({ id: "rev1" });
    db.agentAuditEvent.create.mockResolvedValue({ id: "audit1" });
    db.agentInboxItem.createMany.mockResolvedValue({ count: 0 });
  });

  it("asks only the issues whose area the change touched, and never the issue it fixes", async () => {
    const fixed = issue({ id: "bug-fixed", number: 7, pullRequestUrl: PR });
    const touched = issue({ id: "bug-touched", number: 8 });
    const elsewhere = issue({ id: "bug-elsewhere", number: 9 });
    db.issueRepro.findMany.mockResolvedValue([
      repro(fixed),
      repro(touched),
      repro(elsewhere, { affectedPaths: ["app/api/v1/ideas"] }),
    ]);

    const result = await reportCodeChange(agent("reporter"), scope, change({ pullRequestUrl: PR }));

    expect(result.status).toBe(201);
    const body = result.status === 201 ? result.body : null;
    expect(body?.affected).toHaveLength(1);
    expect(body?.affected[0]).toMatchObject({ issueId: "bug-touched", matchedPaths: ["lib/agent-api"], asked: true });
    expect(db.issueRevalidation.create).toHaveBeenCalledTimes(1);
    expect(db.issueRevalidation.create.mock.calls[0][0].data).toMatchObject({
      bugId: "bug-touched",
      trigger: "pull_request",
      commitSha: SHA,
      agentId: "reporter",
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "issue.revalidation_asked", bugId: "bug-touched" }),
    );
  });

  it("reports the same commit again without asking a second time", async () => {
    db.issueRepro.findMany.mockResolvedValue([repro(issue({ id: "bug-touched", number: 8 }))]);
    db.issueRevalidation.findUnique.mockResolvedValue({ id: "rev1" });

    const result = await reportCodeChange(agent("reporter"), scope, change());

    expect(result.status === 201 && result.body.affected[0].asked).toBe(false);
    expect(db.issueRevalidation.create).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});

describe("answering a re-check", () => {
  const answer = {
    verdict: "possibly_fixed",
    summary: "Filters keep their state now.",
    description: "Followed the profile: the filter query survives a reload.",
    commitSha: SHA,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.bug.findFirst.mockResolvedValue(issue());
    db.issueRevalidation.findUnique.mockResolvedValue(null);
    db.issueRevalidation.update.mockResolvedValue(stored());
    db.issueRevalidation.create.mockResolvedValue(stored());
    db.agentAuditEvent.create.mockResolvedValue({ id: "audit1" });
    db.agentInboxItem.createMany.mockResolvedValue({ count: 0 });
  });

  it("refuses the agent holding the claim: it re-checks its own work", async () => {
    db.bug.findFirst.mockResolvedValue(
      issue({ claims: [{ status: "active", releasedAt: null, agentId: "holder", agent: { ownerUserId: "ada" } }] }),
    );

    const result = await giveRevalidation(agent("holder"), scope, "bug1", answer);

    expect(result.status).toBe(403);
    expect(result.status !== 201 && result.body.error).toBe("not_independent");
    expect(db.issueRevalidation.update).not.toHaveBeenCalled();
    expect(db.issueRevalidation.create).not.toHaveBeenCalled();
  });

  it("refuses the agent that reported the change, so a fresh look answers it", async () => {
    db.issueRevalidation.findUnique.mockResolvedValue({ id: "rev1", agentId: "reporter" });

    const result = await giveRevalidation(agent("reporter"), scope, "bug1", answer);

    expect(result.status).toBe(403);
    expect(result.status !== 201 && result.body.error).toBe("not_independent");
  });

  it("replaces that commit's answer and leaves the issue where it is", async () => {
    db.issueRevalidation.findUnique.mockResolvedValue({ id: "rev1", agentId: "reporter" });

    const result = await giveRevalidation(agent("fresh", "dana"), scope, "bug1", answer);

    expect(result.status).toBe(201);
    expect(result.status === 201 && result.body.revalidation.verdict).toBe("possibly_fixed");
    expect(db.issueRevalidation.update.mock.calls[0][0].data).toMatchObject({
      verdict: "possibly_fixed",
      verdictAgentId: "fresh",
      verdictOnBehalfOfUserId: "dana",
    });
    // The issue is not written at all: a verdict is evidence, and a person
    // closes a stale report. The prisma mock has no `bug.update` on purpose.
    expect(events.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "issue.revalidated", bugId: "bug1" }),
    );
  });
});
