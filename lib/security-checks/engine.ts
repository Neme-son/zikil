import type { Prisma, PrismaClient, SecuritySeverity } from "@prisma/client";
import { award } from "@/lib/points/award";
import { agentsMayWork } from "@/lib/security-checks";
import { pickAgentFor, type CandidateAgent } from "./assign";

/**
 * The security check engine (#security-checks, part 3). Ziki-managed
 * on-call agents (`Agent.onCallAt`) do the work:
 *
 * 1. A `queued` check (ownership proven) moves to `splitting` with one `split` job.
 * 2. Waiting jobs are given to online on-call agents, a few at a time each,
 *    preferring agents active in the client's workspace (its default agents).
 * 3. The split job's agent adds the parts to check; the check moves to `checking`.
 * 4. Each part's agent reports what it found.
 * 5. When every part is in, the check gets one `collate` job: an on-call
 *    agent reads every result and writes the summary. Posting it makes the
 *    check `done`, and only then does the client see the results (isReportPosted).
 * 6. A job not reported within JOB_TIMEOUT_MINUTES goes back to waiting, so a
 *    failed part goes to another agent and the collate job waits for it.
 * 7. Once the client has paid, each reported job's pay is released once.
 *    On-call agents are run by Ziki and earn nothing (Mark, 12 Nov): their
 *    pay is marked released with no points.
 *
 * Every state change is a conditional update checked by its count, because
 * the sweep, an agent asking for work and the timeout can reach the same row.
 * Results are private: nothing here logs or publishes their text.
 */

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;
type Transactional = Pick<PrismaClient, "$transaction">;

export const JOB_TIMEOUT_MINUTES = 60;
/** How many open jobs one agent may hold, so a check's parts spread across agents. */
export const MAX_OPEN_JOBS_PER_AGENT = 2;
/** An agent counts as online when one of its keys was used this recently. */
export const ONLINE_WINDOW_MS = 15 * 60 * 1000;
export const SPLIT_JOB_POINTS = 5;
export const PART_JOB_POINTS = 3;
export const MIN_PARTS = 1;
export const MAX_PARTS = 30;
export const MAX_RESULTS_PER_PART = 20;
export const SUMMARY_MIN = 20;
export const SUMMARY_MAX = 5_000;

export class SecurityJobError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SecurityJobError";
  }
}

/** Source key for a job's pay: one per job, so a job reassigned and reported pays once. */
export function securityJobSourceKey(itemId: string): string {
  return `security-check:${itemId}`;
}

/** What a job would pay an agent that isn't on-call. The collate job is on-call work and pays nothing. */
export function jobPoints(kind: "split" | "check" | "collate"): number {
  if (kind === "collate") return 0;
  return kind === "split" ? SPLIT_JOB_POINTS : PART_JOB_POINTS;
}

// ---------------------------------------------------------------------------
// 1. Queued checks get their split job.

/** Moves every queued, verified check to `splitting` with its one split job. */
export async function startQueuedChecks(db: Db & Transactional, now = new Date()): Promise<number> {
  const queued = await db.securityCheck.findMany({
    where: { status: "queued", target: { verifiedAt: { not: null } } },
    select: { id: true, target: { select: { kind: true, value: true } } },
    take: 100,
  });
  let started = 0;
  for (const check of queued) {
    const moved = await db.$transaction(async (tx) => {
      const { count } = await tx.securityCheck.updateMany({
        where: { id: check.id, status: "queued" },
        data: { status: "splitting", startedAt: now },
      });
      if (count !== 1) return false;
      await tx.securityCheckItem.create({
        data: {
          checkId: check.id,
          kind: "split",
          title: `Plan the checks for ${check.target.value}`,
          instructions: `Look at this ${check.target.kind} and add the parts to check, ${MIN_PARTS} to ${MAX_PARTS} of them. Look only; never exploit anything.`,
        },
      });
      return true;
    });
    if (moved) started++;
  }
  return started;
}

// ---------------------------------------------------------------------------
// 2. Jobs go back when an agent sits on them, or when the check stopped.

/** Takes back jobs not reported in time, and skips the open jobs of cancelled checks. */
export async function reclaimStaleJobs(db: Db, now = new Date()): Promise<{ reclaimed: number; skipped: number }> {
  const cutoff = new Date(now.getTime() - JOB_TIMEOUT_MINUTES * 60_000);
  const reclaimed = await db.securityCheckItem.updateMany({
    where: { status: "checking", assignedAt: { lt: cutoff } },
    data: { status: "waiting", agentId: null, assignedAt: null },
  });
  const skipped = await db.securityCheckItem.updateMany({
    where: { status: { in: ["waiting", "checking"] }, check: { status: "cancelled" } },
    data: { status: "skipped" },
  });
  return { reclaimed: reclaimed.count, skipped: skipped.count };
}

// ---------------------------------------------------------------------------
// 3. Waiting jobs go to online on-call agents.

/** Online on-call agents with room for another job, and the workspaces each is active in. */
export async function availableAgents(db: Db, now = new Date(), onlyAgentId?: string): Promise<CandidateAgent[]> {
  const since = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const agents = await db.agent.findMany({
    where: {
      ...(onlyAgentId ? { id: onlyAgentId } : {}),
      onCallAt: { not: null },
      revokedAt: null,
      pausedAt: null,
      apiKeys: { some: { revokedAt: null, lastUsedAt: { gte: since } } },
    },
    select: {
      id: true,
      activations: { where: { deactivatedAt: null }, select: { organisationId: true } },
      _count: { select: { securityCheckItems: { where: { status: "checking" } } } },
    },
  });
  return agents
    .map((agent) => ({
      id: agent.id,
      organisationIds: agent.activations.map((a) => a.organisationId),
      openJobs: agent._count.securityCheckItems,
    }))
    .filter((agent) => agent.openJobs < MAX_OPEN_JOBS_PER_AGENT);
}

/**
 * Gives waiting jobs, oldest first, to available agents. With `onlyAgentId`
 * (an agent asking for work), only that agent is considered.
 */
export async function assignWaitingJobs(db: Db, now = new Date(), onlyAgentId?: string): Promise<number> {
  const agents = await availableAgents(db, now, onlyAgentId);
  if (agents.length === 0) return 0;
  const waiting = await db.securityCheckItem.findMany({
    where: { status: "waiting", agentId: null, check: { status: { in: ["splitting", "checking"] }, target: { verifiedAt: { not: null } } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, check: { select: { organisationId: true } } },
    take: agents.length * MAX_OPEN_JOBS_PER_AGENT,
  });
  let assigned = 0;
  for (const item of waiting) {
    const agent = pickAgentFor(item.check.organisationId, agents, MAX_OPEN_JOBS_PER_AGENT);
    if (!agent) break;
    const { count } = await db.securityCheckItem.updateMany({
      where: { id: item.id, status: "waiting", agentId: null },
      data: { status: "checking", agentId: agent.id, assignedAt: now },
    });
    if (count === 1) {
      agent.openJobs++;
      assigned++;
    }
  }
  return assigned;
}

const SEVERITY_ORDER: Record<SecuritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ---------------------------------------------------------------------------
// The agent's side.

export type SecurityJobResult = { severity: SecuritySeverity; title: string; description: string; howToFix: string };

export type SecurityJob = {
  id: string;
  kind: "split" | "check" | "collate";
  title: string;
  instructions: string | null;
  assignedAt: Date | null;
  reportBy: Date | null;
  check: { id: string; target: { kind: string; value: string } };
  /** For a collate job only: every result of the check, worst first. Private: served only to the holder. */
  results?: SecurityJobResult[];
};

/** The jobs this agent holds now. It is given waiting work first if it has room. */
export async function listAgentJobs(db: Db, agentId: string, now = new Date()): Promise<SecurityJob[]> {
  await assignWaitingJobs(db, now, agentId);
  const items = await db.securityCheckItem.findMany({
    where: { agentId, status: "checking" },
    orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      kind: true,
      title: true,
      instructions: true,
      assignedAt: true,
      check: { select: { id: true, target: { select: { kind: true, value: true } } } },
    },
  });
  const collateCheckIds = items.filter((item) => item.kind === "collate").map((item) => item.check.id);
  const results = collateCheckIds.length
    ? await db.securityCheckResult.findMany({
        where: { checkId: { in: collateCheckIds } },
        select: { checkId: true, severity: true, title: true, description: true, howToFix: true },
      })
    : [];
  return items.map((item) => ({
    ...item,
    reportBy: item.assignedAt ? new Date(item.assignedAt.getTime() + JOB_TIMEOUT_MINUTES * 60_000) : null,
    ...(item.kind === "collate"
      ? {
          results: results
            .filter((r) => r.checkId === item.check.id)
            .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
            .map(({ severity, title, description, howToFix }) => ({ severity, title, description, howToFix })),
        }
      : {}),
  }));
}

/** The job, if this agent holds it now and its check still allows work; otherwise a 404 or 409. */
async function heldJob(tx: Tx, agentId: string, itemId: string) {
  const item = await tx.securityCheckItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      kind: true,
      status: true,
      agentId: true,
      checkId: true,
      check: { select: { status: true, target: { select: { verifiedAt: true } } } },
    },
  });
  if (!item || item.agentId !== agentId) throw new SecurityJobError(404, "not_found", "No such job is held by this agent.");
  if (item.status !== "checking") throw new SecurityJobError(409, "not_held", "This job is no longer yours: it was reported, given back or timed out.");
  if (!agentsMayWork(item.check, item.check.target)) {
    throw new SecurityJobError(409, "check_closed", "This check no longer takes work.");
  }
  return item;
}

/** Marks the job reported, only if this agent still holds it. False when it lost the race. */
async function markReported(tx: Tx, agentId: string, itemId: string, now: Date): Promise<void> {
  const { count } = await tx.securityCheckItem.updateMany({
    where: { id: itemId, agentId, status: "checking" },
    data: { status: "done", reportedAt: now },
  });
  if (count !== 1) throw new SecurityJobError(409, "not_held", "This job is no longer yours: it was reported, given back or timed out.");
}

export type PartInput = { title: string; instructions?: string | null };

/** The split job: adds the parts to check and moves the check to `checking`. */
export async function submitSplit(db: Transactional, agentId: string, itemId: string, parts: PartInput[], now = new Date()) {
  if (parts.length < MIN_PARTS || parts.length > MAX_PARTS) {
    throw new SecurityJobError(400, "invalid_parts", `Add between ${MIN_PARTS} and ${MAX_PARTS} parts to check.`);
  }
  const result = await db.$transaction(async (tx) => {
    const item = await heldJob(tx, agentId, itemId);
    if (item.kind !== "split") throw new SecurityJobError(409, "not_a_split", "This job isn't a split: report what you found, or post the summary.");
    await markReported(tx, agentId, itemId, now);
    await tx.securityCheckItem.createMany({
      data: parts.map((part) => ({
        checkId: item.checkId,
        kind: "check" as const,
        title: part.title,
        instructions: part.instructions ?? null,
      })),
    });
    await tx.securityCheck.updateMany({ where: { id: item.checkId, status: "splitting" }, data: { status: "checking" } });
    await releasePaidJobs(tx, item.checkId, now);
    return { checkId: item.checkId, parts: parts.length };
  });
  return result;
}

export type ResultInput = { severity: SecuritySeverity; title: string; description: string; howToFix: string };

/** A part's job: stores what was found (possibly nothing) and finishes the check once every part is in. */
export async function submitReport(db: Transactional, agentId: string, itemId: string, results: ResultInput[], now = new Date()) {
  if (results.length > MAX_RESULTS_PER_PART) {
    throw new SecurityJobError(400, "too_many_results", `Report at most ${MAX_RESULTS_PER_PART} problems for one part.`);
  }
  return db.$transaction(async (tx) => {
    const item = await heldJob(tx, agentId, itemId);
    if (item.kind === "split") throw new SecurityJobError(409, "is_a_split", "This is the split job: add the parts to check instead.");
    if (item.kind === "collate") throw new SecurityJobError(409, "is_a_collate", "This is the collate job: post the summary instead.");
    await markReported(tx, agentId, itemId, now);
    if (results.length > 0) {
      await tx.securityCheckResult.createMany({
        data: results.map((r) => ({ checkId: item.checkId, itemId, severity: r.severity, title: r.title, description: r.description, howToFix: r.howToFix })),
      });
    }
    const collating = await queueCollateIfComplete(tx, item.checkId, now);
    await releasePaidJobs(tx, item.checkId, now);
    return { checkId: item.checkId, results: results.length, collating };
  });
}

/** Gives a job back for another agent. */
export async function releaseJob(db: Db, agentId: string, itemId: string): Promise<void> {
  const { count } = await db.securityCheckItem.updateMany({
    where: { id: itemId, agentId, status: "checking" },
    data: { status: "waiting", agentId: null, assignedAt: null },
  });
  if (count !== 1) throw new SecurityJobError(409, "not_held", "This job is not held by this agent.");
}

/**
 * Once the check has parts and none is still open, queues its one collate job
 * (guarded by `collatingAt`, so two reports finishing together queue it once).
 * True when this call queued it.
 */
export async function queueCollateIfComplete(tx: Tx, checkId: string, now = new Date()): Promise<boolean> {
  const [open, parts] = await Promise.all([
    tx.securityCheckItem.count({ where: { checkId, status: { in: ["waiting", "checking"] } } }),
    tx.securityCheckItem.count({ where: { checkId, kind: "check" } }),
  ]);
  if (open > 0 || parts === 0) return false;
  const { count } = await tx.securityCheck.updateMany({
    where: { id: checkId, status: "checking", collatingAt: null },
    data: { collatingAt: now },
  });
  if (count !== 1) return false;
  const check = await tx.securityCheck.findUnique({ where: { id: checkId }, select: { target: { select: { value: true } } } });
  await tx.securityCheckItem.create({
    data: {
      checkId,
      kind: "collate",
      title: `Write the report for ${check?.target.value ?? "this check"}`,
      instructions:
        "Read every result of this check and write one plain-language summary for the owner: what was checked, the worst problems first, and what to do next. Don't repeat secrets.",
    },
  });
  return true;
}

/** The collate job: posts the summary. The check becomes `done` and the client sees the report. */
export async function submitSummary(db: Transactional, agentId: string, itemId: string, summary: string, now = new Date()) {
  const text = summary.trim();
  if (text.length < SUMMARY_MIN || text.length > SUMMARY_MAX) {
    throw new SecurityJobError(400, "invalid_summary", `Write a summary of ${SUMMARY_MIN} to ${SUMMARY_MAX} characters.`);
  }
  return db.$transaction(async (tx) => {
    const item = await heldJob(tx, agentId, itemId);
    if (item.kind !== "collate") throw new SecurityJobError(409, "not_a_collate", "Only the collate job posts the summary.");
    await markReported(tx, agentId, itemId, now);
    const { count } = await tx.securityCheck.updateMany({
      where: { id: item.checkId, status: "checking", postedAt: null },
      data: { status: "done", finishedAt: now, postedAt: now, summary: text },
    });
    if (count !== 1) throw new SecurityJobError(409, "already_posted", "This check's report was already posted.");
    await releasePaidJobs(tx, item.checkId, now);
    return { checkId: item.checkId, posted: true };
  });
}

// ---------------------------------------------------------------------------
// 6. Pay, only once the client has paid.

/**
 * Releases each reported job's pay on a paid check, once per job (the source
 * key and the conditional `payoutReleasedAt` both guard it): `jobPoints` to
 * the agent's owner, into the client's workspace ledger, except for on-call
 * agents, which earn nothing. An unpaid check pays nobody.
 */
export async function releasePaidJobs(tx: Tx, checkId: string, now = new Date()): Promise<number> {
  const check = await tx.securityCheck.findUnique({ where: { id: checkId }, select: { organisationId: true, paidAt: true } });
  if (!check?.paidAt) return 0;
  const due = await tx.securityCheckItem.findMany({
    where: { checkId, status: "done", payoutReleasedAt: null, agentId: { not: null } },
    select: { id: true, kind: true, agentId: true, agent: { select: { ownerUserId: true, onCallAt: true } } },
  });
  let paid = 0;
  for (const item of due) {
    if (!item.agentId || !item.agent) continue;
    const { count } = await tx.securityCheckItem.updateMany({
      where: { id: item.id, payoutReleasedAt: null },
      data: { payoutReleasedAt: now },
    });
    if (count !== 1) continue;
    // On-call agents are run by Ziki and earn nothing: released, no points.
    if (item.agent.onCallAt) continue;
    const points = jobPoints(item.kind);
    if (points <= 0) continue;
    await award(tx, {
      organisationId: check.organisationId,
      userId: item.agent.ownerUserId,
      agentId: item.agentId,
      bugId: null,
      role: "security_check",
      points,
      sourceKey: securityJobSourceKey(item.id),
    });
    paid++;
  }
  return paid;
}

/** Releases pay for every paid check with reported jobs still unpaid. */
export async function releaseAllPaidJobs(db: Transactional & Db, now = new Date()): Promise<number> {
  const checks = await db.securityCheck.findMany({
    where: { paidAt: { not: null }, items: { some: { status: "done", payoutReleasedAt: null, agentId: { not: null } } } },
    select: { id: true },
    take: 200,
  });
  let paid = 0;
  for (const { id } of checks) paid += await db.$transaction((tx) => releasePaidJobs(tx, id, now));
  return paid;
}

// ---------------------------------------------------------------------------
// The sweep, run by the platform cron.

export type SecurityCheckSweep = { started: number; reclaimed: number; skipped: number; assigned: number; paid: number };

export async function sweepSecurityChecks(db: Transactional & Db, now = new Date()): Promise<SecurityCheckSweep> {
  const started = await startQueuedChecks(db, now);
  const { reclaimed, skipped } = await reclaimStaleJobs(db, now);
  const assigned = await assignWaitingJobs(db, now);
  const paid = await releaseAllPaidJobs(db, now);
  return { started, reclaimed, skipped, assigned, paid };
}
