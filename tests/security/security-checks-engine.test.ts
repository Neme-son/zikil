import { beforeEach, describe, expect, it, vi } from "vitest";

const award = vi.fn();
vi.mock("@/lib/points/award", () => ({ award: (...args: unknown[]) => award(...args) }));

import { pickAgentFor } from "@/lib/security-checks/assign";
import {
  JOB_TIMEOUT_MINUTES,
  PART_JOB_POINTS,
  SPLIT_JOB_POINTS,
  SecurityJobError,
  assignWaitingJobs,
  finishCheckIfComplete,
  reclaimStaleJobs,
  releasePaidJobs,
  securityJobSourceKey,
  startQueuedChecks,
  submitReport,
  submitSplit,
} from "@/lib/security-checks/engine";

/** A fake Prisma client: every model method is a mock, and $transaction runs the callback on the same fake. */
function fakeDb() {
  const db = {
    securityCheck: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    securityCheckItem: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), count: vi.fn() },
    securityCheckResult: { createMany: vi.fn() },
    agent: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return db;
}
type FakeDb = ReturnType<typeof fakeDb>;
// The engine takes Prisma types; the fake has the methods it uses.
const asDb = (db: FakeDb) => db as never;

const now = new Date("2026-11-12T10:00:00Z");
const verified = { verifiedAt: new Date("2026-11-12T09:00:00Z") };

function heldItem(overrides: Record<string, unknown> = {}) {
  return { id: "item1", kind: "check", status: "checking", agentId: "agentA", checkId: "check1", check: { status: "checking", target: verified }, ...overrides };
}

beforeEach(() => {
  award.mockReset();
  award.mockResolvedValue(true);
});

describe("who gets a job (#security-checks)", () => {
  const agents = [
    { id: "far", organisationIds: ["other"], openJobs: 0 },
    { id: "home-busy", organisationIds: ["client"], openJobs: 1 },
    { id: "home", organisationIds: ["client"], openJobs: 0 },
  ];

  it("prefers agents in the client's workspace, then the least busy", () => {
    expect(pickAgentFor("client", agents, 2)?.id).toBe("home");
  });

  it("falls back to any always-on agent", () => {
    expect(pickAgentFor("nobody-here", agents, 2)?.id).toBe("far");
  });

  it("never exceeds an agent's open-job limit", () => {
    expect(pickAgentFor("client", [{ id: "full", organisationIds: ["client"], openJobs: 2 }], 2)).toBeNull();
  });
});

describe("starting a check", () => {
  it("creates one split job only when it wins the queued → splitting move", async () => {
    const db = fakeDb();
    db.securityCheck.findMany.mockResolvedValue([
      { id: "won", target: { kind: "website", value: "settle.ng" } },
      { id: "lost", target: { kind: "website", value: "other.ng" } },
    ]);
    db.securityCheck.updateMany.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ count: where.id === "won" ? 1 : 0 }));
    expect(await startQueuedChecks(asDb(db), now)).toBe(1);
    expect(db.securityCheckItem.create).toHaveBeenCalledTimes(1);
    expect(db.securityCheckItem.create.mock.calls[0][0].data).toMatchObject({ checkId: "won", kind: "split" });
    expect(db.securityCheck.findMany.mock.calls[0][0].where).toMatchObject({ status: "queued", target: { verifiedAt: { not: null } } });
  });
});

describe("taking jobs back", () => {
  it("returns jobs not reported within the timeout and skips cancelled checks' jobs", async () => {
    const db = fakeDb();
    db.securityCheckItem.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });
    expect(await reclaimStaleJobs(asDb(db), now)).toEqual({ reclaimed: 2, skipped: 1 });
    const stale = db.securityCheckItem.updateMany.mock.calls[0][0];
    expect(stale.where.assignedAt.lt).toEqual(new Date(now.getTime() - JOB_TIMEOUT_MINUTES * 60_000));
    expect(stale.data).toEqual({ status: "waiting", agentId: null, assignedAt: null });
  });
});

describe("giving out jobs", () => {
  it("gives waiting jobs to online always-on agents, only when the job is still free", async () => {
    const db = fakeDb();
    db.agent.findMany.mockResolvedValue([{ id: "agentA", activations: [{ organisationId: "client" }], _count: { securityCheckItems: 0 } }]);
    db.securityCheckItem.findMany.mockResolvedValue([
      { id: "j1", check: { organisationId: "client" } },
      { id: "j2", check: { organisationId: "client" } },
    ]);
    db.securityCheckItem.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await assignWaitingJobs(asDb(db), now)).toBe(1);
    expect(db.agent.findMany.mock.calls[0][0].where).toMatchObject({ alwaysOnAt: { not: null }, revokedAt: null, pausedAt: null });
    expect(db.securityCheckItem.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "j1", status: "waiting", agentId: null },
      data: { status: "checking", agentId: "agentA", assignedAt: now },
    });
  });

  it("does nothing when no always-on agent is online", async () => {
    const db = fakeDb();
    db.agent.findMany.mockResolvedValue([]);
    expect(await assignWaitingJobs(asDb(db), now)).toBe(0);
    expect(db.securityCheckItem.findMany).not.toHaveBeenCalled();
  });
});

describe("the split job", () => {
  it("adds the parts and moves the check to checking", async () => {
    const db = fakeDb();
    db.securityCheckItem.findUnique.mockResolvedValue(heldItem({ kind: "split", check: { status: "splitting", target: verified } }));
    db.securityCheckItem.updateMany.mockResolvedValue({ count: 1 });
    db.securityCheck.updateMany.mockResolvedValue({ count: 1 });
    db.securityCheck.findUnique.mockResolvedValue({ organisationId: "client", paidAt: null });
    const result = await submitSplit(asDb(db), "agentA", "item1", [{ title: "Login form: rate limits" }, { title: "Security headers" }], now);
    expect(result).toEqual({ checkId: "check1", parts: 2 });
    expect(db.securityCheckItem.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(db.securityCheck.updateMany).toHaveBeenCalledWith({ where: { id: "check1", status: "splitting" }, data: { status: "checking" } });
  });

  it("refuses no parts", async () => {
    await expect(submitSplit(asDb(fakeDb()), "agentA", "item1", [], now)).rejects.toMatchObject({ status: 400, code: "invalid_parts" });
  });

  it("refuses an agent that doesn't hold the job", async () => {
    const db = fakeDb();
    db.securityCheckItem.findUnique.mockResolvedValue(heldItem({ kind: "split", agentId: "someoneElse" }));
    await expect(submitSplit(asDb(db), "agentA", "item1", [{ title: "Headers" }], now)).rejects.toMatchObject({ status: 404 });
  });
});

describe("reporting a part", () => {
  const found = [{ severity: "high" as const, title: "Admin page open", description: "The /admin page loads with no login.", howToFix: "Require a signed-in admin for /admin." }];

  it("stores the results and finishes the check when every part is in", async () => {
    const db = fakeDb();
    db.securityCheckItem.findUnique.mockResolvedValue(heldItem());
    db.securityCheckItem.updateMany.mockResolvedValue({ count: 1 });
    db.securityCheckItem.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    db.securityCheck.updateMany.mockResolvedValue({ count: 1 });
    db.securityCheck.findUnique.mockResolvedValue({ organisationId: "client", paidAt: null });
    const result = await submitReport(asDb(db), "agentA", "item1", found, now);
    expect(result).toEqual({ checkId: "check1", results: 1, checkDone: true });
    expect(db.securityCheckResult.createMany.mock.calls[0][0].data[0]).toMatchObject({ checkId: "check1", itemId: "item1", severity: "high" });
  });

  it("refuses a late report after the job was taken back", async () => {
    const db = fakeDb();
    db.securityCheckItem.findUnique.mockResolvedValue(heldItem({ status: "waiting" }));
    await expect(submitReport(asDb(db), "agentA", "item1", found, now)).rejects.toMatchObject({ status: 409, code: "not_held" });
    expect(db.securityCheckResult.createMany).not.toHaveBeenCalled();
  });

  it("refuses work on a check whose target lost its ownership proof", async () => {
    const db = fakeDb();
    db.securityCheckItem.findUnique.mockResolvedValue(heldItem({ check: { status: "checking", target: { verifiedAt: null } } }));
    await expect(submitReport(asDb(db), "agentA", "item1", [], now)).rejects.toBeInstanceOf(SecurityJobError);
  });

  it("refuses when another request reported it first", async () => {
    const db = fakeDb();
    db.securityCheckItem.findUnique.mockResolvedValue(heldItem());
    db.securityCheckItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(submitReport(asDb(db), "agentA", "item1", [], now)).rejects.toMatchObject({ status: 409 });
  });
});

describe("finishing a check", () => {
  it("waits while any part is open, and needs at least one part", async () => {
    const db = fakeDb();
    db.securityCheckItem.count.mockResolvedValueOnce(1).mockResolvedValueOnce(3);
    expect(await finishCheckIfComplete(asDb(db), "check1", now)).toBe(false);
    db.securityCheckItem.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    expect(await finishCheckIfComplete(asDb(db), "check1", now)).toBe(false);
    expect(db.securityCheck.updateMany).not.toHaveBeenCalled();
  });
});

describe("paying agents (#security-checks)", () => {
  it("pays nobody while the client hasn't paid", async () => {
    const db = fakeDb();
    db.securityCheck.findUnique.mockResolvedValue({ organisationId: "client", paidAt: null });
    expect(await releasePaidJobs(asDb(db), "check1", now)).toBe(0);
    expect(award).not.toHaveBeenCalled();
  });

  it("pays each reported job once the client pays: 5 for the split, 3 per part", async () => {
    const db = fakeDb();
    db.securityCheck.findUnique.mockResolvedValue({ organisationId: "client", paidAt: now });
    db.securityCheckItem.findMany.mockResolvedValue([
      { id: "split1", kind: "split", agentId: "agentA", agent: { ownerUserId: "ownerA" } },
      { id: "part1", kind: "check", agentId: "agentB", agent: { ownerUserId: "ownerB" } },
      { id: "part2", kind: "check", agentId: "agentB", agent: { ownerUserId: "ownerB" } },
    ]);
    // part2 was paid by a concurrent run: its conditional update matches nothing.
    db.securityCheckItem.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await releasePaidJobs(asDb(db), "check1", now)).toBe(2);
    expect(award).toHaveBeenCalledTimes(2);
    expect(award.mock.calls[0][1]).toEqual({
      organisationId: "client",
      userId: "ownerA",
      agentId: "agentA",
      bugId: null,
      role: "security_check",
      points: SPLIT_JOB_POINTS,
      sourceKey: securityJobSourceKey("split1"),
    });
    expect(award.mock.calls[1][1]).toMatchObject({ userId: "ownerB", points: PART_JOB_POINTS, sourceKey: "security-check:part1" });
  });
});
