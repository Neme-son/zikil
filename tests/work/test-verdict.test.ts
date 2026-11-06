import { afterSendBack, judgementCounts } from "@/lib/marketing/track";
import {
  consolidateJudgingFeedback,
  countJudgingVotes,
  judgingIneligibility,
  judgingStatus,
  resolveJudgingQuorum,
  validateJudgingSubmission,
  type JudgingChecks,
} from "@/lib/judging/rules";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Judging delivered work (#434, #529, #727, #owner-agents): the agent holding the claim can't judge its own work, anyone else can; one verdict per agent; good to merge needs a ready pull request; weighted judgements move the issue. */
type Row = {
  id: string;
  bugId: string;
  agentId: string;
  onBehalfOfUserId: string;
  goodToMerge: boolean;
  summary: string;
  description: string;
  pullRequestUrl?: string | null;
  changedAt?: Date | null;
};

type JudgingRow = {
  id: string;
  bugId: string;
  deliveryId: string;
  deliveryRound: number;
  agentId: string;
  ownerId: string;
  approved: boolean;
  checks: Record<string, boolean>;
  evidence: Array<{ type: string; url: string; caption?: string }>;
  notes: string;
  createdAt: Date;
};

const state = vi.hoisted(() => ({
  verdicts: [] as Row[],
  judgingVerdicts: [] as JudgingRow[],
  judgingEvents: [] as Array<Record<string, unknown>>,
}));

const db = vi.hoisted(() => ({
  bug: { findFirst: vi.fn(), update: vi.fn() },
  delivery: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  issueClaim: { findMany: vi.fn(), updateMany: vi.fn() },
  membership: { findUnique: vi.fn() },
  testVerdict: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  judgingVerdict: { findMany: vi.fn(), create: vi.fn() },
  judgingEvent: { findMany: vi.fn(), create: vi.fn() },
  projectWorkflow: { findUnique: vi.fn() },
  pullRequestReport: { findFirst: vi.fn() },
  agentAuditEvent: { create: vi.fn() },
  comment: { create: vi.fn() },
  bugActivity: { create: vi.fn() },
  agentEvent: { create: vi.fn() },
  webhookSubscription: { findMany: vi.fn() },
  webhookDelivery: { createMany: vi.fn() },
  jobSubmission: { findUnique: vi.fn(), update: vi.fn() },
  jobReview: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  jobReviewOffer: { findFirst: vi.fn(), update: vi.fn() },
  pointEntry: { createMany: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const tested = vi.hoisted(() => ({ refreshJudgedStatus: vi.fn() }));
vi.mock("@/lib/agent-api/tested-status", () => ({ refreshJudgedStatus: tested.refreshJudgedStatus }));

const notify = vi.hoisted(() => ({ notifyMergeFailed: vi.fn() }));
vi.mock("@/lib/agent-notifications", () => ({ notifyMergeFailed: notify.notifyMergeFailed }));

const PR = "https://github.com/Zedu-Endor/issue-tracker/pull/42";

/** The latest independent report on the pull request (#pr-reports); by default open, checks passing, no conflict. */
function report(overrides: Record<string, unknown> = {}) {
  return {
    id: "rep1",
    bugId: "bug1",
    pullRequestUrl: PR,
    state: "open",
    mergedInto: null,
    inDefaultBranch: null,
    headSha: null,
    mergeCommitSha: null,
    checks: "passing",
    mergeable: true,
    note: "Checked it on GitHub.",
    agentId: "checker",
    onBehalfOfUserId: "cy",
    createdAt: new Date("2026-10-30T09:00:00Z"),
    agent: { name: "checker" },
    onBehalfOf: { name: "Cy" },
    ...overrides,
  };
}

import { submitTestVerdict } from "@/lib/agent-api/test-verdict";
import { getJudgingView, submitJudgingVerdict } from "@/lib/judging/service";
import type { AgentContext } from "@/lib/agents/require-agent";
import { reviewJobSubmission } from "@/lib/jobs/review";

/** An issue Ada filed herself, with no agent and no claim. */
function bugRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "bug1",
    tenantId: "tenant_zedu",
    status: "done", substatus: "requires_review",
    pullRequestUrl: PR,
    pullRequestHeadSha: null as string | null,
    title: "A fix",
    assigneeId: "ada",
    project: { repoUrl: "https://github.com/Zedu-Endor/issue-tracker" },
    beneficiaryUserId: "ada",
    createdByAgentId: null,
    createdByAgent: null,
    claims: [],
    ...overrides,
  };
}

function reviewer(id: string, ownerId: string, level: "working" | "manager" | "merger" = "working") {
  return { agentId: id, name: id, ownerId, tenantId: "tenant_zedu", level, burst: false, keyId: `key-${id}` };
}

const files = [{ path: "lib/save.ts", lines: "42" }];
const good = { goodToMerge: true, summary: "Good to merge.", description: "Tested on the branch: it works.", files };
const notGood = (description: string) => ({ goodToMerge: false, summary: "Not good to merge.", description, files });

beforeEach(() => {
  vi.clearAllMocks();
  state.verdicts = [];
  state.judgingVerdicts = [];
  state.judgingEvents = [];
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
  db.bug.findFirst.mockResolvedValue(bugRow());
  db.delivery.findFirst.mockResolvedValue(null);
  db.delivery.findMany.mockResolvedValue([]);
  db.membership.findUnique.mockResolvedValue({ id: "m1" });
  db.comment.create.mockResolvedValue({ id: "c1" });
  db.bugActivity.create.mockResolvedValue({});
  db.pullRequestReport.findFirst.mockResolvedValue(report());
  db.agentEvent.create.mockResolvedValue({ id: "e1" });
  db.webhookSubscription.findMany.mockResolvedValue([]);
  db.testVerdict.findFirst.mockImplementation(async ({ where }: { where: Record<string, string> }) => {
    // A copy, as Prisma returns: a later update mustn't change what was read.
    const row = state.verdicts.find((v) => v.bugId === where.bugId && v.agentId === where.agentId);
    return row ? { ...row } : null;
  });
  db.testVerdict.create.mockImplementation(async ({ data }: { data: Omit<Row, "id"> }) => {
    const row = { id: `tv${state.verdicts.length + 1}`, changedAt: null, ...data };
    state.verdicts.push(row);
    return row;
  });
  db.testVerdict.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
    const row = state.verdicts.find((v) => v.id === where.id)!;
    Object.assign(row, data);
    return row;
  });
  db.judgingVerdict.findMany.mockImplementation(async () => state.judgingVerdicts.map((row) => ({
    ...row,
    agent: { name: row.agentId },
    owner: { name: row.ownerId },
  })));
  db.judgingVerdict.create.mockImplementation(async ({ data }: { data: Omit<JudgingRow, "id" | "createdAt"> }) => {
    const row = { id: `jv${state.judgingVerdicts.length + 1}`, createdAt: new Date(), ...data };
    state.judgingVerdicts.push(row);
    return { id: row.id, createdAt: row.createdAt };
  });
  db.judgingEvent.findMany.mockImplementation(async () => state.judgingEvents.map((event) => ({
    ...event,
    agent: { name: String(event.agentId) },
    owner: { name: String(event.ownerId) },
  })));
  db.judgingEvent.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const event = { id: `je${state.judgingEvents.length + 1}`, createdAt: new Date(), ...data };
    state.judgingEvents.push(event);
    return event;
  });
  db.projectWorkflow.findUnique.mockResolvedValue({ judgePassQuorum: 2, judgeRejectQuorum: 2 });
  db.bug.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(judgeIssue, data);
    return judgeIssue;
  });
  db.delivery.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(judgeIssue.deliveries[0], data);
    return judgeIssue.deliveries[0];
  });
  db.issueClaim.findMany.mockResolvedValue([]);
  db.issueClaim.updateMany.mockResolvedValue({ count: 0 });
});

const judgeIssue = {
  id: "bug1",
  number: 42,
  tenantId: "tenant_zedu",
  projectId: "project1",
  title: "A fix",
  summary: "The save button fails.",
  description: "Save does not finish.",
  proofLinks: [],
  status: "done",
  substatus: "requires_review",
  judgingFeedback: null,
  deliveries: [{
    id: "delivery1",
    judgingState: "open",
    judgingRound: 1,
    pullRequestUrl: PR,
    summary: "Fixed save.",
    description: "Waits for the pending request.",
    screenshots: [],
    testResults: "2 passed",
    deliverableUrls: [],
    agentId: "solver-agent",
    agent: { name: "Solver", ownerUserId: "solver-owner" },
    beneficiary: { name: "Solver owner" },
  }],
  claims: [{
    agentId: "solver-agent",
    agent: { name: "Solver", ownerUserId: "solver-owner", owner: { name: "Solver owner" } },
  }],
};

function judgeAgent(agentId: string, ownerId: string, level: "working" | "manager" | "merger" = "working"): AgentContext {
  return {
    agentId,
    name: agentId,
    ownerId,
    tenantId: "tenant_zedu",
    level,
    burst: false,
    keyId: `key-${agentId}`,
  };
}

describe("submitTestVerdict: who may verdict (#434)", () => {

  it("rejects the agent holding the active claim", async () => {
    db.bug.findFirst.mockResolvedValue(
      bugRow({ claims: [{ status: "active", releasedAt: null, agentId: "r1", agent: { ownerUserId: "rob" } }] }),
    );
    expect(await submitTestVerdict(reviewer("r1", "rob"), "bug1", good)).toMatchObject({
      status: 403,
      error: "fixer_cannot_verdict",
    });
    expect(state.verdicts).toHaveLength(0);
  });

  it("lets the beneficiary's, the filer's and the reporter's own agents judge (#owner-agents)", async () => {
    expect(await submitTestVerdict(reviewer("r3", "ada"), "bug1", good)).toMatchObject({ status: 201 });
    db.bug.findFirst.mockResolvedValue(bugRow({ createdByAgentId: "f1", createdByAgent: { ownerUserId: "rob" } }));
    expect(await submitTestVerdict(reviewer("r2", "rob"), "bug1", good)).toMatchObject({ status: 201 });
    db.bug.findFirst.mockResolvedValue(bugRow({ beneficiaryUserId: null, reporterId: "ada" }));
    expect(await submitTestVerdict(reviewer("r4", "ada"), "bug1", good)).toMatchObject({ status: 201 });
  });

  it("lets the claim holder's owner judge through another agent, but not through the agent holding the claim", async () => {
    db.bug.findFirst.mockResolvedValue(
      bugRow({ claims: [{ status: "active", releasedAt: null, agentId: "w1", agent: { ownerUserId: "rob" } }] }),
    );
    expect(await submitTestVerdict(reviewer("r2", "rob"), "bug1", good)).toMatchObject({ status: 201 });
    expect((await submitTestVerdict(reviewer("w1", "rob"), "bug1", good)).status).toBe(403);
  });

});

describe("submitTestVerdict: the body and record (#434)", () => {
  it("records a good-to-merge verdict for the owner", async () => {
    const result = await submitTestVerdict(reviewer("r1", "rob"), "bug1", good);
    expect(result).toMatchObject({ status: 201, verdict: { goodToMerge: true, onBehalfOfUserId: "rob" } });
    expect(state.verdicts[0]).toMatchObject({ bugId: "bug1", agentId: "r1", onBehalfOfUserId: "rob", goodToMerge: true });
  });

  it("keeps one verdict per agent per issue: reporting again replaces it (#529)", async () => {
    const rob = reviewer("r1", "rob");
    expect(await submitTestVerdict(rob, "bug1", good)).toMatchObject({ status: 201 });
    const changed = await submitTestVerdict(rob, "bug1", notGood("Regresses the Safari login"));
    expect(changed).toMatchObject({ status: 200, changed: true, verdict: { goodToMerge: false, summary: "Not good to merge.", description: "Regresses the Safari login" } });
    expect(state.verdicts).toHaveLength(1);
    expect(state.verdicts[0]).toMatchObject({ goodToMerge: false, changedAt: expect.any(Date) });
  });

});

describe("submitTestVerdict: judges delivered work (#526, #delivered-step)", () => {
  it("is refused until the work is delivered", async () => {
    db.bug.findFirst.mockResolvedValue(bugRow({ pullRequestUrl: null }));
    expect(await submitTestVerdict(reviewer("r1", "rob"), "bug1", good)).toMatchObject({
      status: 409,
      error: "not_delivered",
    });
    expect(db.testVerdict.create).not.toHaveBeenCalled();
  });

  it("refuses a new good-to-merge once the work is Done, and reads no pull request report (#727)", async () => {
    db.bug.findFirst.mockResolvedValue(bugRow({ status: "done", substatus: "accepted" }));
    expect(await submitTestVerdict(reviewer("r3", "rose"), "bug1", good)).toMatchObject({ status: 409, error: "enough_verdicts" });
    expect(db.testVerdict.create).not.toHaveBeenCalled();
    expect(db.pullRequestReport.findFirst).not.toHaveBeenCalled();
    expect(tested.refreshJudgedStatus).not.toHaveBeenCalled();
  });

});

describe("submitTestVerdict: good to merge needs a ready pull request, as reported (#255, #pr-reports)", () => {
  const tester = () => reviewer("r1", "rob");
  const recorded = () => db.testVerdict.create.mock.calls.length + db.testVerdict.update.mock.calls.length;
  /** What the caller is told: the reason, then what the author has to do. Nothing is posted (#review-entries). */
  const refusal = (result: unknown) => {
    expect(db.comment.create).not.toHaveBeenCalled();
    expect(db.bugActivity.create).not.toHaveBeenCalled();
    const { message, todo } = result as { message: string; todo: string };
    return `${message} What to do: ${todo}`;
  };

  it("records nothing while the reported checks are failing, and says what the author has to do", async () => {
    db.pullRequestReport.findFirst.mockResolvedValue(report({ checks: "failing" }));

    const result = await submitTestVerdict(tester(), "bug1", good);

    expect(result).toMatchObject({ status: 409, error: "not_ready", missing: "deployment_verification" });
    expect(recorded()).toBe(0);
    expect(refusal(result)).toMatch(/^The latest report says its checks are failing.*What to do: The author opens the pull request's Checks tab/);
    expect(notify.notifyMergeFailed).toHaveBeenCalledWith(expect.objectContaining({ recipientId: "ada" }));
  });

  it("always records a not-good-to-merge verdict, even when the pull request isn't ready", async () => {
    db.pullRequestReport.findFirst.mockResolvedValue(report({ checks: "failing" }));

    expect(await submitTestVerdict(tester(), "bug1", notGood("It breaks the tab bar."))).toMatchObject({ status: 201 });
    expect(db.comment.create).not.toHaveBeenCalled();
  });
});

describe("submitTestVerdict: a verdict is an entry with a summary and a description (#review-entries)", () => {
  it("refuses a bare verdict with 400, naming the missing field, before touching the issue", async () => {
    const rob = reviewer("r1", "rob");
    expect(await submitTestVerdict(rob, "bug1", { goodToMerge: true })).toMatchObject({ status: 400, error: "invalid_request", field: "summary", message: "Add a summary." });
    expect(await submitTestVerdict(rob, "bug1", { goodToMerge: true, summary: "Good." })).toMatchObject({ status: 400, field: "description" });
    expect(await submitTestVerdict(rob, "bug1", { goodToMerge: true, summary: "One. Two. Three.", description: "x" })).toMatchObject({
      status: 400,
      field: "summary",
      message: "Keep the summary to two sentences.",
    });
    expect(db.bug.findFirst).not.toHaveBeenCalled();
    expect(state.verdicts).toHaveLength(0);
  });
});

describe("submitTestVerdict: marketing work", () => {
  it("records a verdict on delivered marketing work without pull request or files", async () => {
    db.bug.findFirst.mockResolvedValue(
      bugRow({
        track: "marketing",
        pullRequestUrl: null,
        pullRequestHeadSha: null,
      }),
    );
    db.delivery.findFirst.mockResolvedValue({ id: "del-1", updatedAt: new Date() });

    const result = await submitTestVerdict(reviewer("r1", "rob"), "bug1", {
      goodToMerge: true,
      summary: "Looks great.",
      description: "Tested the deliverable copy and links.",
    });

    expect(result).toMatchObject({
      status: 201,
      verdict: {
        goodToMerge: true,
        summary: "Looks great.",
        pullRequestUrl: null,
        headSha: null,
      },
    });
    expect(state.verdicts[0]).toMatchObject({
      goodToMerge: true,
      pullRequestUrl: null,
      headSha: null,
      files: [],
    });
  });

  it("refuses marketing work that has no delivery record", async () => {
    db.bug.findFirst.mockResolvedValue(
      bugRow({
        track: "marketing",
        pullRequestUrl: null,
      }),
    );
    db.delivery.findFirst.mockResolvedValue(null);

    const result = await submitTestVerdict(reviewer("r1", "rob"), "bug1", {
      goodToMerge: true,
      summary: "Looks great.",
      description: "Tested the deliverable copy and links.",
    });

    expect(result).toMatchObject({
      status: 409,
      error: "not_delivered",
    });
  });

  it("requires files for product work", async () => {
    db.bug.findFirst.mockResolvedValue(bugRow({ track: "product" }));

    const result = await submitTestVerdict(reviewer("r1", "rob"), "bug1", {
      goodToMerge: true,
      summary: "Looks great.",
      description: "Tested it.",
    });

    expect(result).toMatchObject({
      status: 400,
      error: "invalid_request",
      field: "files",
    });
  });
});

describe("the Delivered rule after each judgement (#delivered-step)", () => {
  const judged = async () => (await vi.importActual<typeof import("@/lib/agent-api/tested-status")>("@/lib/agent-api/tested-status")).refreshJudgedStatus;
  const PULL = "https://github.com/emerjent/ziki/pull/9";
  function judgedDb(opts: {
    track?: "product" | "marketing";
    revisionCount?: number;
    substatus?: string;
    delivery?: { updatedAt: Date };
    verdicts: { owner: string; good?: boolean; agent?: string; level?: string; updatedAt?: Date }[];
  }) {
    const isMarketing = opts.track === "marketing";
    const bug = {
      id: "bug1",
      tenantId: "t1",
      projectId: "p1",
      status: "done",
      substatus: opts.substatus ?? "requires_review",
      track: opts.track ?? "product",
      revisionCount: opts.revisionCount ?? 0,
      pullRequestUrl: isMarketing ? null : PULL,
      assigneeId: "ada",
      beneficiaryUserId: "ada",
      reporterId: "rex",
      createdByAgentId: null,
      createdByAgent: null,
      claims: [{ id: "claim1", status: "active", claimedAt: new Date(), releasedAt: null, agentId: "solver", beneficiaryUserId: "ada", dispatcherUserId: null, agent: { ownerUserId: "ada" } }],
    };
    const delivery = opts.delivery ?? (isMarketing ? { id: "d1", updatedAt: new Date("2026-11-04T10:00:00Z"), pullRequestUrl: null, beneficiaryUserId: "ada" } : null);
    return {
      bug: { findUnique: vi.fn(async () => bug), update: vi.fn(async () => ({})) },
      delivery: {
        findFirst: vi.fn(async () => delivery),
        findMany: vi.fn(async () => (delivery ? [delivery] : [])),
      },
      testVerdict: {
        findMany: vi.fn(async () =>
          opts.verdicts.map((v, i) => ({
            goodToMerge: v.good ?? true,
            headSha: null,
            pullRequestUrl: isMarketing ? null : PULL,
            updatedAt: v.updatedAt ?? new Date("2026-11-04T12:00:00Z"),
            onBehalfOfUserId: v.owner,
            agent: { id: v.agent ?? `agent-${i}`, ownerUserId: v.owner, level: v.level ?? "working" },
          })),
        ),
      },
      issueClaim: { update: vi.fn(async () => ({})) },
      bugActivity: { create: vi.fn(async () => ({})) },
      agentEvent: { create: vi.fn(async () => ({ id: "e1" })) },
      webhookSubscription: { findMany: vi.fn(async () => []) },
      webhookDelivery: { createMany: vi.fn(async () => ({ count: 0 })) },
    };
  }

  it("moves delivered work to Accepted once good judgements weigh 3, and never on one agent alone", async () => {
    const refresh = await judged();
    const three = judgedDb({ verdicts: [{ owner: "rob" }, { owner: "sam" }, { owner: "tia" }] });
    expect(await refresh(three as never, "bug1", "sam")).toBe("accepted");
    expect(three.bug.update).toHaveBeenCalledWith({ where: { id: "bug1" }, data: { status: "done", substatus: "accepted" } });
    expect(await refresh(judgedDb({ verdicts: [{ owner: "rob" }, { owner: "sam" }] }) as never, "bug1", "sam")).toBeNull();
    // A manager agent's judgement weighs 2: not enough alone, enough with one working agent, the same owner's included.
    expect(await refresh(judgedDb({ verdicts: [{ owner: "ada", agent: "ada-manager", level: "manager" }] }) as never, "bug1", "ada")).toBeNull();
    expect(await refresh(judgedDb({ verdicts: [{ owner: "ada", agent: "ada-manager", level: "manager" }, { owner: "ada", agent: "ada-worker" }] }) as never, "bug1", "ada")).toBe("accepted");
  });

  it("sends it back to Open, releasing the claim and clearing the pull request, once as many say not good", async () => {
    const db = judgedDb({ verdicts: [{ owner: "rob", good: false }, { owner: "sam", good: false }, { owner: "tia", good: false }] });
    expect(await (await judged())(db as never, "bug1", "sam")).toBe("open");
    expect(db.issueClaim.update).toHaveBeenCalledWith({ where: { id: "claim1" }, data: { status: "released", releasedAt: expect.any(Date), releaseReason: "judged_not_good" } });
    expect(db.bug.update).toHaveBeenCalledWith({ where: { id: "bug1" }, data: { status: "open", substatus: "open", assigneeId: null, pullRequestUrl: null, pullRequestHeadSha: null } });
  });

  it("marketing track: 3 good judgements move delivered work to Accepted without a pull request", async () => {
    const refresh = await judged();
    const db = judgedDb({
      track: "marketing",
      verdicts: [{ owner: "rob" }, { owner: "sam" }, { owner: "tia" }],
    });
    expect(await refresh(db as never, "bug1", "sam")).toBe("accepted");
    expect(db.bug.update).toHaveBeenCalledWith({ where: { id: "bug1" }, data: { status: "done", substatus: "accepted" } });
  });

  it("marketing track: not good judgements use up a revision round and return to in_progress (same claim)", async () => {
    const refresh = await judged();
    const db = judgedDb({
      track: "marketing",
      revisionCount: 0,
      verdicts: [{ owner: "rob", good: false }, { owner: "sam", good: false }, { owner: "tia", good: false }],
    });
    expect(await refresh(db as never, "bug1", "sam")).toBe("in_progress");
    expect(db.bug.update).toHaveBeenCalledWith({
      where: { id: "bug1" },
      data: { status: "in_progress", substatus: "in_progress", revisionCount: 1 },
    });
    expect(db.issueClaim.update).not.toHaveBeenCalled();
  });

  it("marketing track: reaching revision limit reopens issue for bids and releases claim", async () => {
    const refresh = await judged();
    const db = judgedDb({
      track: "marketing",
      revisionCount: 2,
      verdicts: [{ owner: "rob", good: false }, { owner: "sam", good: false }, { owner: "tia", good: false }],
    });
    expect(await refresh(db as never, "bug1", "sam")).toBe("open");
    expect(db.bug.update).toHaveBeenCalledWith({
      where: { id: "bug1" },
      data: { status: "open", substatus: "open", assigneeId: null, revisionCount: 0 },
    });
    expect(db.issueClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "claim1" },
        data: expect.objectContaining({ status: "released", releaseReason: "judged_not_good" }),
      }),
    );
  });

  it("counts a person's working agents once, and never the agent holding the claim", async () => {
    const refresh = await judged();
    expect(await refresh(judgedDb({ verdicts: [{ owner: "rob", agent: "a1" }, { owner: "rob", agent: "a2" }, { owner: "sam" }] }) as never, "bug1", "rob")).toBeNull();
    expect(await refresh(judgedDb({ verdicts: [{ owner: "ada", agent: "solver" }, { owner: "rob" }, { owner: "sam" }] }) as never, "bug1", "rob")).toBeNull();
    expect(await refresh(judgedDb({ verdicts: [{ owner: "rob" }, { owner: "sam" }, { owner: "ada" }] }) as never, "bug1", "rob")).toBe("accepted");
  });

  it("returns Accepted to Requires review when a judgement changes and the good count drops", async () => {
    const db = judgedDb({ substatus: "accepted", verdicts: [{ owner: "rob" }, { owner: "sam" }] });
    expect(await (await judged())(db as never, "bug1", "sam")).toBe("requires_review");
  });
});

describe("reviewJobSubmission: concurrent accepts (#584)", () => {
  it("serializes verdicts so the last accept sees the first and accepts the row once", async () => {
    const submission = {
      id: "submission-1",
      jobId: "job-1",
      agentId: "submitter-agent",
      beneficiaryUserId: "submitter",
      reviewsNeeded: 2,
      status: "pending",
      reviewedAt: null as Date | null,
      job: { id: "job-1", tenantId: "tenant_zedu", projectId: "p1", pointsPerAccepted: 25 },
    };
    const committedReviews: Array<Record<string, unknown>> = [];
    let awardCount = 0;
    let lockTail = Promise.resolve();

    db.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      let releaseLock: (() => void) | undefined;
      const pendingReviews: Array<Record<string, unknown>> = [];
      const tx = {
        $queryRaw: async () => {
          const previous = lockTail;
          lockTail = new Promise<void>((resolve) => { releaseLock = resolve; });
          await previous;
          return [{ id: submission.id }];
        },
        jobSubmission: {
          findUnique: async () => ({ ...submission }),
          update: async ({ data }: { data: Partial<typeof submission> }) => {
            Object.assign(submission, data);
            return { ...submission };
          },
        },
        jobReview: {
          findFirst: async ({ where }: { where: { agentId: string } }) =>
            [...committedReviews, ...pendingReviews].find((row) => row.agentId === where.agentId) ?? null,
          findMany: async () => [...committedReviews, ...pendingReviews],
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const row = { id: `review-${committedReviews.length + pendingReviews.length + 1}`, ...data };
            pendingReviews.push(row);
            return row;
          },
        },
        jobReviewOffer: {
          findFirst: async ({ where }: { where: { agentId: string } }) => ({
            id: `offer-${where.agentId}`,
            deadlineAt: new Date(Date.now() + 60_000),
          }),
          update: async () => ({}),
        },
        pointEntry: {
          createMany: async () => ({ count: ++awardCount === 1 ? 1 : 0 }),
        },
        agentAuditEvent: { create: async () => ({}) },
        agentEvent: { create: async () => ({ id: "job-review-event" }) },
        webhookSubscription: { findMany: async () => [] },
        webhookDelivery: { createMany: async () => ({ count: 0 }) },
      };

      try {
        const result = await callback(tx);
        committedReviews.push(...pendingReviews);
        return result;
      } finally {
        releaseLock?.();
      }
    });

    const [first, second] = await Promise.all([
      reviewJobSubmission(reviewer("reviewer-agent-1", "owner-1"), submission.id, { verdict: "accept" }),
      reviewJobSubmission(reviewer("reviewer-agent-2", "owner-2"), submission.id, { verdict: "accept" }),
    ]);

    expect([first.submission.status, second.submission.status].sort()).toEqual(["accepted", "pending"]);
    expect(submission.status).toBe("accepted");
    expect(committedReviews).toHaveLength(2);
    expect(awardCount).toBe(1);
  });
});

describe("sending marketing work back", () => {
  const marketing = (revisionCount: number) => ({ track: "marketing" as const, revisionCount });

  it("returns it to the same worker until the rounds are used up, then reopens it with a fresh count", () => {
    expect(afterSendBack(marketing(0), 2, "judgement")).toEqual({ substatus: "in_progress", keepsClaim: true, revisionCount: 1 });
    expect(afterSendBack(marketing(1), 2, "judgement")).toEqual({ substatus: "in_progress", keepsClaim: true, revisionCount: 2 });
    expect(afterSendBack(marketing(2), 2, "judgement")).toEqual({ substatus: "open", keepsClaim: false, revisionCount: 0 });
  });

  it("uses up a round when a manager rejects it too", () => {
    expect(afterSendBack(marketing(0), 2, "manager_reject")).toEqual({ substatus: "in_progress", keepsClaim: true, revisionCount: 1 });
    expect(afterSendBack(marketing(2), 2, "manager_reject")).toEqual({ substatus: "open", keepsClaim: false, revisionCount: 0 });
  });

  it("leaves product work as it is: judgements reopen it, a reject returns it", () => {
    const product = { track: "product" as const, revisionCount: 0 };
    expect(afterSendBack(product, 2, "judgement")).toEqual({ substatus: "open", keepsClaim: false, revisionCount: 0 });
    expect(afterSendBack(product, 2, "manager_reject")).toEqual({ substatus: "in_progress", keepsClaim: true, revisionCount: 0 });
  });

  it("counts only judgements since the latest marketing delivery, and product judgements by pull request", () => {
    const delivered = new Date("2026-11-04T10:00:00Z");
    const before = new Date("2026-11-04T09:00:00Z");
    const after = new Date("2026-11-04T11:00:00Z");
    const delivery = { updatedAt: delivered, pullRequestUrl: null };
    expect(judgementCounts("marketing", { updatedAt: before, pullRequestUrl: null }, delivery)).toBe(false);
    expect(judgementCounts("marketing", { updatedAt: after, pullRequestUrl: null }, delivery)).toBe(true);
    const pr = "https://github.com/emerjent/ziki/pull/1";
    expect(judgementCounts("product", { updatedAt: before, pullRequestUrl: pr }, { updatedAt: delivered, pullRequestUrl: pr })).toBe(true);
    expect(judgementCounts("product", { updatedAt: after, pullRequestUrl: "other" }, { updatedAt: delivered, pullRequestUrl: pr })).toBe(false);
  });
});

describe("structured judging rules", () => {
  const checks: JudgingChecks = {
    reproducedOnMain: true,
    fixWorksOnDeliveredBranch: true,
    regressionsChecked: true,
    proofMatchesObserved: true,
  };
  const evidence = [{ type: "test_output" as const, url: "https://example.test/results/42" }];

  it("requires every approval check and evidence, and useful feedback for a send-back", () => {
    expect(validateJudgingSubmission({ outcome: "approve", checks, evidence })).toMatchObject({ success: true });
    expect(validateJudgingSubmission({ outcome: "approve", checks, evidence: [] })).toMatchObject({
      success: false,
      errors: expect.arrayContaining(["Add at least one evidence link before approving."]),
    });
    expect(validateJudgingSubmission({
      outcome: "approve",
      checks: { ...checks, regressionsChecked: false },
      evidence,
    })).toMatchObject({
      success: false,
      errors: expect.arrayContaining(["Tick “Nearby behaviour checked for regressions” before approving."]),
    });
    expect(validateJudgingSubmission({ outcome: "send_back", checks, notes: "Needs work." })).toMatchObject({
      success: false,
      errors: expect.arrayContaining(["Add at least 20 characters of notes explaining what needs to change."]),
    });
  });

  describe("Judge Workbench service", () => {
    const approval = {
      outcome: "approve",
      checks: {
        reproducedOnMain: true,
        fixWorksOnDeliveredBranch: true,
        regressionsChecked: true,
        proofMatchesObserved: true,
      },
      evidence: [{ type: "test_output", url: "https://example.test/results/42" }],
      notes: "",
    };

    beforeEach(() => {
      Object.assign(judgeIssue, { status: "done", substatus: "requires_review", judgingFeedback: null });
      Object.assign(judgeIssue.deliveries[0], { judgingState: "open", judgingRound: 1 });
      db.bug.findFirst.mockResolvedValue(judgeIssue as never);
      db.projectWorkflow.findUnique.mockResolvedValue({ judgePassQuorum: 2, judgeRejectQuorum: 2 });
    });

    it("keeps other judges' verdicts, counts, and outcomes blind until the caller judges", async () => {
      state.judgingVerdicts.push({
        id: "jv1",
        bugId: "bug1",
        deliveryId: "delivery1",
        deliveryRound: 1,
        agentId: "judge-1",
        ownerId: "owner-1",
        approved: true,
        checks: approval.checks,
        evidence: approval.evidence,
        notes: "",
        createdAt: new Date("2026-11-04T10:00:00Z"),
      });
      state.judgingEvents.push({
        id: "je1",
        type: "verdict_submitted",
        outcome: "approve",
        deliveryRound: 1,
        createdAt: new Date("2026-11-04T10:00:00Z"),
        agentId: "judge-1",
        ownerId: "owner-1",
      });

      const result = await getJudgingView(judgeAgent("judge-2", "owner-2"), "bug1");

      expect(result).toMatchObject({
        status: 200,
        view: {
          verdictsSubmitted: 1,
          canJudge: true,
          history: [{ type: "verdict_submitted", outcome: null }],
        },
      });
      if (result.status !== 200) throw new Error("Expected judging view.");
      expect(result.view).not.toHaveProperty("verdicts");
      expect(result.view).not.toHaveProperty("counts");
    });

    it("passes the delivery at the configured approval quorum and returns the revealed workbench", async () => {
      db.projectWorkflow.findUnique.mockResolvedValue({ judgePassQuorum: 1, judgeRejectQuorum: 2 });

      const result = await submitJudgingVerdict(judgeAgent("judge-1", "owner-1"), "bug1", approval);

      expect(result).toMatchObject({
        status: 201,
        view: {
          delivery: { state: "passed", round: 1 },
          issue: { status: "done", substatus: "requires_review" },
          counts: { approvals: 1, approveQuorum: 1 },
          verdicts: [{ outcome: "approve", agentName: "judge-1" }],
          canJudge: false,
          reason: "judging_closed",
        },
      });
      expect(db.$queryRaw).toHaveBeenCalled();
      expect(db.delivery.update).toHaveBeenCalledWith({
        where: { id: "delivery1" },
        data: { judgingState: "passed" },
      });
    });

    it("sends a delivery back at the rejection quorum, saves consolidated feedback, and releases the claim", async () => {
      state.judgingVerdicts.push({
        id: "jv1",
        bugId: "bug1",
        deliveryId: "delivery1",
        deliveryRound: 1,
        agentId: "judge-1",
        ownerId: "owner-1",
        approved: false,
        checks: { ...approval.checks, fixWorksOnDeliveredBranch: false },
        evidence: [],
        notes: "The delivered change still fails when retrying the save.",
        createdAt: new Date("2026-11-04T10:00:00Z"),
      });
      db.issueClaim.findMany.mockResolvedValue([{ id: "claim1", agentId: "solver-agent", beneficiaryUserId: "solver-owner" }]);
      const sendBack = {
        outcome: "send_back",
        checks: { ...approval.checks, fixWorksOnDeliveredBranch: false },
        evidence: [],
        notes: "The delivered change still fails when retrying the save.",
      };

      const result = await submitJudgingVerdict(judgeAgent("judge-2", "owner-2"), "bug1", sendBack);

      expect(result).toMatchObject({
        status: 201,
        view: {
          delivery: { state: "rejected" },
          issue: { status: "open", substatus: "open" },
          feedback: {
            checkFailures: { fixWorksOnDeliveredBranch: 2 },
            notes: [{ ownerName: "owner-1" }, { ownerName: "owner-2" }],
          },
        },
      });
      expect(db.issueClaim.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { bugId: "bug1", status: "active", releasedAt: null },
        data: expect.objectContaining({ status: "released", releaseReason: "judged_not_good" }),
      }));
    });
  });

  it("rejects malformed or unsafe evidence URLs", () => {
    for (const url of ["", "file:///tmp/report", "javascript:alert(1)", "https://x".padEnd(2049, "x")]) {
      expect(validateJudgingSubmission({ outcome: "approve", checks, evidence: [{ type: "link", url }] }).success).toBe(false);
    }
    expect(validateJudgingSubmission({ outcome: "approve", checks, evidence, extra: true }).success).toBe(false);
  });

  it("enforces tester, owner, claim-holder, and once-per-owner eligibility", () => {
    const eligible = {
      role: "tester",
      agentId: "tester-1",
      ownerId: "owner-1",
      claimHolderAgentId: "solver",
      claimHolderOwnerId: "solver-owner",
      judgedAgentIds: [],
      judgedOwnerIds: [],
      closed: false,
    };
    expect(judgingIneligibility(eligible)).toBeNull();
    expect(judgingIneligibility({ ...eligible, role: "manager" })).toBe("not_tester");
    expect(judgingIneligibility({ ...eligible, agentId: "solver" })).toBe("own_work");
    expect(judgingIneligibility({ ...eligible, ownerId: "solver-owner" })).toBe("same_owner");
    expect(judgingIneligibility({ ...eligible, judgedOwnerIds: ["owner-1"] })).toBe("already_judged");
    expect(judgingIneligibility({ ...eligible, closed: true })).toBe("judging_closed");
  });

  it("replays one vote per owner until the first quorum wins", () => {
    const votes = [
      { ownerId: "a", outcome: "approve" as const },
      { ownerId: "a", outcome: "send_back" as const },
      { ownerId: "b", outcome: "send_back" as const },
      { ownerId: "c", outcome: "approve" as const },
    ];
    expect(countJudgingVotes(votes)).toEqual({ submitted: 3, approvals: 2, sendBacks: 1 });
    expect(resolveJudgingQuorum(votes, { approve: 2, send_back: 2 })).toEqual({
      outcome: "approve",
      approvals: 2,
      sendBacks: 1,
    });
    expect(resolveJudgingQuorum(votes.slice(0, 3), { approve: 2, send_back: 2 })).toBeNull();
  });

  it("maps approval and rejection outcomes and consolidates only send-back feedback", () => {
    expect(judgingStatus("approve")).toEqual({ status: "done", substatus: "requires_review", deliveryState: "passed" });
    expect(judgingStatus("send_back")).toEqual({ status: "open", substatus: "open", deliveryState: "rejected" });
    expect(consolidateJudgingFeedback([
      { outcome: "approve", agentName: "Ada", ownerName: "A", checks, notes: "" },
      { outcome: "send_back", agentName: "Bob", ownerName: "B", checks: { ...checks, fixWorksOnDeliveredBranch: false }, notes: "The fix still fails on retry." },
    ])).toEqual({
      checkFailures: { reproducedOnMain: 0, fixWorksOnDeliveredBranch: 1, regressionsChecked: 0, proofMatchesObserved: 0 },
      notes: [{ agentName: "Bob", ownerName: "B", notes: "The fix still fails on retry." }],
    });
    });
  });
