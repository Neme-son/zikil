import { describe, expect, it, vi } from "vitest";

// #pr-reports: whether a pull request was closed without merging is the latest
// agent report on it; Ziki never asks GitHub.
/** Retries never pay or debit twice (#428, #450, #622): every award has one source key, and a correction is written once. */
const reports = vi.hoisted(() => ({
  reportedClosedUnmerged: vi.fn(async (_bugId: string, url?: string | null) => url?.includes("closed") ?? false),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/agent-api/pull-request-report", () => ({
  reportedClosedUnmerged: reports.reportedClosedUnmerged,
}));

import { award, awardDispatcher, solverAward } from "@/lib/points/award";
import { correct } from "@/lib/points/correct";
import { backfillPoints, type BackfillLine, type HistoricalBug } from "@/lib/points/backfill";
import type { PointAward } from "@/lib/points/award";

/** An in-memory ledger with the unique `sourceKey` the database enforces. */
function fakeLedger() {
  const rows: Array<Record<string, unknown>> = [];
  const createMany = vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
    let count = 0;
    for (const row of data) {
      if (rows.some((r) => r.sourceKey === row.sourceKey)) continue;
      rows.push(row);
      count++;
    }
    return { count };
  });
  return { rows, db: { pointEntry: { createMany } } as never, createMany };
}

const issue = { id: "bug-1", organisationId: "organisation-zedu", assigneeId: "user-1" };

describe("points ledger (#428)", () => {
  it("pays the dispatcher once per completed issue, including reassignment", async () => {
    const { db, rows } = fakeLedger();
    expect(await awardDispatcher(db, { id: "bug-1", organisationId: "organisation-zedu" }, "dispatcher-owner")).toBe(true);
    expect(await awardDispatcher(db, { id: "bug-1", organisationId: "organisation-zedu" }, "dispatcher-owner")).toBe(false);
    expect(await awardDispatcher(db, { id: "bug-1", organisationId: "organisation-zedu" }, "another-owner")).toBe(false);
    expect(rows).toEqual([{
      organisationId: "organisation-zedu", bugId: "bug-1", userId: "dispatcher-owner",
      role: "dispatcher", points: 0.6, sourceKey: "dispatcher:bug-1",
    }]);
  });

  it("awards the solver the issue's reward once, even when resolved again", async () => {
    const { db, rows } = fakeLedger();
    const entry = solverAward({ ...issue, reward: 5 })!;
    expect(await award(db, entry)).toBe(true);
    expect(await award(db, entry)).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ points: 5, role: "solver" });
  });

  it("skips duplicates in the database instead of failing", async () => {
    const { db, createMany } = fakeLedger();
    await award(db, { organisationId: "t", userId: "u", bugId: null, role: "reporter", points: 5, sourceKey: "reporter:b:u" });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

});

describe("corrections (#450)", () => {
  it("writes one reversing entry under one key, however often the undo is retried", async () => {
    const createMany = vi.fn(async () => ({ count: 1 }));
    const db = { pointEntry: { update: vi.fn(async () => ({})), createMany } } as never;
    const entry = { id: "entry-1", organisationId: "organisation-zedu", userId: "user-1", bugId: "bug-1", role: "reporter" as const, points: 5 };
    await correct(db, { entry });
    await correct(db, { entry });
    const rows = createMany.mock.calls.map((call) => (call as unknown as [{ data: Array<{ sourceKey: string; points: number }>; skipDuplicates: boolean }])[0]);
    expect(rows.map((r) => r.data[0])).toEqual([
      expect.objectContaining({ sourceKey: "undo:entry-1", points: -5 }),
      expect.objectContaining({ sourceKey: "undo:entry-1", points: -5 }),
    ]);
    expect(rows.every((r) => r.skipDuplicates)).toBe(true);
  });
});

type HistoricalConfirmation = {
  id: string;
  bugId: string;
  onBehalfOfUserId: string;
  agentId: string | null;
  agent: { ownerUserId: string } | null;
  verdict: "confirm" | "reject" | "neutral";
  weightClass: string;
  duplicateOfId: string | null;
  updatedAt: Date;
  undoneAt: Date | null;
};

/** Real backfill/confirmation/award rules over persisted rows, including source-key uniqueness. */
function historicalLedger() {
  const bugs: HistoricalBug[] = [];
  const confirmations: HistoricalConfirmation[] = [];
  const revisions: Array<{ bugId: string; editedAt: Date }> = [];
  const penalties: Array<{ bugId: string; confirmationId: string }> = [];
  const rows: PointAward[] = [];
  let competingInsert: PointAward | undefined;
  const ledger = {
    bug: {
      findMany: async ({ where, cursor, take }: { where?: { id?: string }; cursor?: { id: string }; take?: number }) => {
        const found = where?.id ? bugs.filter((bug) => bug.id === where.id) : bugs;
        const start = cursor ? found.findIndex((bug) => bug.id === cursor.id) + 1 : 0;
        return found.slice(start, take ? start + take : undefined);
      },
      findUnique: async ({ where }: { where: { id: string } }) => bugs.find((bug) => bug.id === where.id) ?? null,
    },
    bugRevision: {
      findMany: async ({ where }: { where: { bugId: { in: string[] } } }) =>
        revisions.filter((row) => where.bugId.in.includes(row.bugId)),
    },
    issueConfirmation: {
      findMany: async ({ where }: { where: { bugId: { in: string[] }; verdict: { in: string[] }; undoneAt: null } }) =>
        confirmations.filter((row) => where.bugId.in.includes(row.bugId) && where.verdict.in.includes(row.verdict) && row.undoneAt === where.undoneAt),
    },
    confirmationPenalty: {
      findMany: async ({ where }: { where: { bugId: string } }) => penalties.filter((row) => row.bugId === where.bugId),
    },
    platformSettings: { findUnique: async () => ({ rewardConfig: { confirmationReviewer: 2, triagerClear: 1, duplicateMarker: 5 } }) },
    organisation: { findUnique: async () => ({ pointsMultiplier: 3 }) },
    pointEntry: {
      findMany: async ({ where }: { where: { sourceKey: { in: string[] } } }) => rows.filter((row) => where.sourceKey.in.includes(row.sourceKey)),
      createMany: async ({ data }: { data: PointAward[] }) => {
        if (competingInsert) {
          rows.push(competingInsert);
          competingInsert = undefined;
        }
        let count = 0;
        for (const entry of data) {
          if (rows.some((row) => row.sourceKey === entry.sourceKey)) continue;
          rows.push(entry);
          count++;
        }
        return { count };
      },
    },
  };
  function addBug(id: string, overrides: Partial<HistoricalBug> = {}) {
    bugs.push({ id, organisationId: "org", projectId: "project", status: "open", assigneeId: null,
      reporterId: "reporter", beneficiaryUserId: "reporter", duplicateOfId: null, isDeleted: false,
      createdAt: new Date("2026-10-22T00:00:00Z"), ...overrides });
  }
  function confirm(bugId: string, userId: string, minute: number, overrides: Partial<HistoricalConfirmation> = {}) {
    const id = `${bugId}-${userId}`;
    confirmations.push({ id, bugId, onBehalfOfUserId: userId, agentId: `agent-${userId}`,
      agent: { ownerUserId: userId }, verdict: "confirm", weightClass: "working", duplicateOfId: null,
      updatedAt: new Date(Date.UTC(2026, 9, 22, 1, minute)), undoneAt: null, ...overrides });
    return id;
  }
  return { db: ledger as never, rows, revisions, penalties, addBug, confirm,
    raceWith: (entry: PointAward) => { competingInsert = entry; } };
}

describe("historical reviewer and triager recovery (#539)", () => {
  it("recovers missing award families in historical owner order, preserving attribution and partial credits across reruns", async () => {
    const history = historicalLedger();
    history.addBug("confirmed");
    // Deliberately unsorted; the fourth distinct owner receives half pay.
    history.confirm("confirmed", "fourth", 4);
    history.confirm("confirmed", "second", 2, { agentId: null, agent: null });
    history.confirm("confirmed", "first", 1);
    history.confirm("confirmed", "third", 3);
    history.confirm("confirmed", "first", 5, { id: "first-manager", weightClass: "manager" });
    history.addBug("duplicate", { duplicateOfId: "confirmed" });
    history.confirm("duplicate", "marker", 6, { verdict: "reject", duplicateOfId: "confirmed" });
    const existing: PointAward = { organisationId: "org", bugId: "confirmed", userId: "first",
      role: "reviewer", points: 99, sourceKey: "reviewer-confirm:confirmed:first" };
    history.rows.push(existing);

    await backfillPoints(history.db, { batchSize: 1 });
    const paid = history.rows.filter((row) => row.role !== "reporter");
    expect(paid).toHaveLength(9);
    expect(history.rows.find((row) => row.sourceKey === existing.sourceKey)).toEqual(existing);
    expect(paid).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceKey: "triager-clear:confirmed:first", points: 3, agentId: "agent-first", createdAt: new Date("2026-10-22T01:01:00Z") }),
      expect.objectContaining({ sourceKey: "reviewer-confirm:confirmed:second", points: 6, agentId: null, createdAt: new Date("2026-10-22T01:02:00Z") }),
      expect.objectContaining({ sourceKey: "reviewer-confirm:confirmed:fourth", points: 3 }),
      expect.objectContaining({ sourceKey: "triager-clear:confirmed:fourth", points: 1.5 }),
      expect.objectContaining({ sourceKey: "duplicate-marker:duplicate:marker", points: 15, agentId: "agent-marker", createdAt: new Date("2026-10-22T01:06:00Z") }),
    ]));
    const before = structuredClone(history.rows);
    const repeated = await backfillPoints(history.db, { batchSize: 1 });
    expect(repeated.written).toBe(0);
    expect(repeated.existing).toBe(repeated.planned);
    expect(history.rows).toEqual(before);
  });

  it("previews the scaled ledger amount and historical identity without writing anything", async () => {
    const history = historicalLedger();
    history.addBug("issue");
    history.confirm("issue", "first", 1);
    const lines: BackfillLine[] = [];
    const preview = await backfillPoints(history.db, { dryRun: true, onLine: (line) => lines.push(line) });
    expect(preview).toMatchObject({ planned: 2, written: 0, existing: 0 });
    expect(history.rows).toEqual([]);
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceKey: "reviewer-confirm:issue:first", points: 2, ledgerPoints: 6,
        organisationId: "org", agentId: "agent-first", createdAt: new Date("2026-10-22T01:01:00Z"), alreadyAwarded: false }),
      expect.objectContaining({ sourceKey: "triager-clear:issue:first", ledgerPoints: 3 }),
    ]));
    await backfillPoints(history.db);
    expect(history.rows.map((row) => [row.sourceKey, row.points])).toEqual(lines.map((line) => [line.sourceKey, line.ledgerPoints]));
  });

  it("does not resurrect deleted, undone, superseded, own-issue or penalised confirmation awards", async () => {
    const history = historicalLedger();
    history.addBug("issue");
    history.revisions.push({ bugId: "issue", editedAt: new Date("2026-10-22T01:02:00Z") });
    history.confirm("issue", "stale", 1);
    history.confirm("issue", "undone", 3, { undoneAt: new Date("2026-10-22T01:04:00Z") });
    history.confirm("issue", "reporter", 4);
    const penalised = history.confirm("issue", "penalised", 5);
    history.penalties.push({ bugId: "issue", confirmationId: penalised });
    history.confirm("issue", "neutral", 6, { verdict: "neutral" });
    history.addBug("deleted", { isDeleted: true });
    history.confirm("deleted", "marker", 7, { verdict: "reject", duplicateOfId: "issue" });
    await backfillPoints(history.db);
    expect(history.rows.filter((row) => row.role !== "reporter")).toEqual([]);
  });

  it("counts a competing live award as existing instead of paying twice", async () => {
    const history = historicalLedger();
    history.addBug("issue");
    history.confirm("issue", "first", 1);
    history.raceWith({ organisationId: "org", bugId: "issue", userId: "first", role: "reviewer",
      points: 6, sourceKey: "reviewer-confirm:issue:first" });
    expect(await backfillPoints(history.db)).toMatchObject({ planned: 2, written: 1, existing: 1 });
    expect(history.rows.filter((row) => row.sourceKey === "reviewer-confirm:issue:first")).toHaveLength(1);
  });
});
