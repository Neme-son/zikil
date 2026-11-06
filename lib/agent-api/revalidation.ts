import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/agents/audit";
import type { AgentContext } from "@/lib/agents/require-agent";
import { reviewerConflict, ReviewerNotIndependentError } from "@/lib/agents/independence";
import { publish } from "@/lib/agent-api/events";
import { issueIdFor } from "@/lib/issue-ref";
import { IssueApiError } from "@/lib/agent-api/errors";
import { codeChangeSchema, reproSchema, revalidationSchema } from "@/lib/validations/revalidation";
import {
  matchedAreas,
  ownFix,
  REVALIDATION_TRIGGER_LABELS,
  REVALIDATION_VERDICT_LABELS,
  type RevalidationTrigger,
  type RevalidationVerdict,
} from "@/lib/revalidation";

/**
 * Issue revalidation (#revalidation).
 *
 * A bug report describes code that moves, and nothing in Ziki noticed when it
 * did: after the fix ships, the report sits in the backlog saying a bug is
 * there long after the code changed under it.
 *
 * So an agent records a repro profile with the report (`IssueRepro`): the
 * files and endpoints the bug lives in, the steps that show it, what was
 * expected, what happened, and the commit it was seen on. When a change lands
 * in that area, an agent reports the paths it touched
 * (`POST /api/v1/projects/{id}/code-changes`) and Ziki matches them against
 * every open issue's profile. Each match becomes an `IssueRevalidation` row
 * with no verdict, which is a `revalidate_issue` item in the work feed. Any
 * agent but the one that reported the change, and but the one holding the
 * claim (the same rule as reviewers), gives the verdict: still reproducible,
 * possibly fixed, no longer reproducible, or the feature is gone.
 *
 * A verdict never moves the issue (AGENTS.md, "The issue model"): it is the
 * evidence a person reads before closing a stale report, and the issue page
 * shows it beside the report.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** The issue columns every route and the feed need to judge and show a re-check. */
const issueForRevalidation = {
  id: true,
  organisationId: true,
  projectId: true,
  number: true,
  title: true,
  status: true,
  substatus: true,
  isDeleted: true,
  pullRequestUrl: true,
  beneficiaryUserId: true,
  reporterId: true,
  assigneeId: true,
  createdByAgent: { select: { ownerUserId: true } },
  claims: {
    select: {
      status: true,
      releasedAt: true,
      beneficiaryUserId: true,
      agentId: true,
      dispatcherUserId: true,
      agent: { select: { ownerUserId: true } },
    },
  },
} satisfies Prisma.BugSelect;

type IssueForRevalidation = Prisma.BugGetPayload<{ select: typeof issueForRevalidation }>;

export const reproSelect = {
  bugId: true,
  affectedPaths: true,
  affectedEndpoints: true,
  steps: true,
  expected: true,
  actual: true,
  commitSha: true,
  agentId: true,
  onBehalfOfUserId: true,
  createdAt: true,
  updatedAt: true,
  agent: { select: { name: true } },
  onBehalfOf: { select: { name: true } },
} satisfies Prisma.IssueReproSelect;

export type StoredRepro = Prisma.IssueReproGetPayload<{ select: typeof reproSelect }>;

export const revalidationSelect = {
  id: true,
  bugId: true,
  trigger: true,
  pullRequestUrl: true,
  commitSha: true,
  changedPaths: true,
  matchedPaths: true,
  verdict: true,
  summary: true,
  description: true,
  agentId: true,
  onBehalfOfUserId: true,
  verdictAgentId: true,
  verdictOnBehalfOfUserId: true,
  verdictAt: true,
  createdAt: true,
  updatedAt: true,
  agent: { select: { name: true } },
  onBehalfOf: { select: { name: true } },
  verdictAgent: { select: { name: true } },
  verdictOnBehalfOf: { select: { name: true } },
} satisfies Prisma.IssueRevalidationSelect;

export type StoredRevalidation = Prisma.IssueRevalidationGetPayload<{ select: typeof revalidationSelect }>;

/** A repro profile as the API and the issue page show it. */
export type ReproView = {
  affectedPaths: string[];
  affectedEndpoints: string[];
  steps: string;
  expected: string;
  actual: string;
  commitSha: string | null;
  recordedAt: Date;
  recordedBy: { agentId: string; agentName: string; userId: string; name: string };
};

export function reproView(repro: StoredRepro | null | undefined): ReproView | null {
  if (!repro) return null;
  return {
    affectedPaths: repro.affectedPaths,
    affectedEndpoints: repro.affectedEndpoints,
    steps: repro.steps,
    expected: repro.expected,
    actual: repro.actual,
    commitSha: repro.commitSha,
    recordedAt: repro.updatedAt,
    recordedBy: {
      agentId: repro.agentId,
      agentName: repro.agent.name,
      userId: repro.onBehalfOfUserId,
      name: repro.onBehalfOf.name ?? "A member",
    },
  };
}

/** A re-check as the API and the issue page show it: what asked for it, and what it found. */
export type RevalidationView = {
  id: string;
  trigger: RevalidationTrigger;
  triggerLabel: string;
  pullRequestUrl: string | null;
  commitSha: string | null;
  changedPaths: string[];
  matchedPaths: string[];
  /** Null while nobody has re-checked it. */
  verdict: RevalidationVerdict | null;
  verdictLabel: string | null;
  summary: string | null;
  description: string | null;
  askedAt: Date;
  askedBy: { agentId: string; agentName: string; userId: string; name: string };
  verdictAt: Date | null;
  verdictBy: { agentId: string; agentName: string; userId: string; name: string } | null;
};

export function revalidationView(revalidation: StoredRevalidation): RevalidationView {
  return {
    id: revalidation.id,
    trigger: revalidation.trigger,
    triggerLabel: REVALIDATION_TRIGGER_LABELS[revalidation.trigger],
    pullRequestUrl: revalidation.pullRequestUrl,
    commitSha: revalidation.commitSha,
    changedPaths: revalidation.changedPaths,
    matchedPaths: revalidation.matchedPaths,
    verdict: revalidation.verdict,
    verdictLabel: revalidation.verdict ? REVALIDATION_VERDICT_LABELS[revalidation.verdict] : null,
    summary: revalidation.summary,
    description: revalidation.description,
    askedAt: revalidation.createdAt,
    askedBy: {
      agentId: revalidation.agentId,
      agentName: revalidation.agent.name,
      userId: revalidation.onBehalfOfUserId,
      name: revalidation.onBehalfOf.name ?? "A member",
    },
    verdictAt: revalidation.verdictAt,
    verdictBy:
      revalidation.verdictAgentId && revalidation.verdictAgent
        ? {
            agentId: revalidation.verdictAgentId,
            agentName: revalidation.verdictAgent.name,
            userId: revalidation.verdictOnBehalfOfUserId ?? "",
            name: revalidation.verdictOnBehalfOf?.name ?? "A member",
          }
        : null,
  };
}

/** The issue's repro profile and its re-checks, newest first, for the issue read and page. */
export async function revalidationForIssue(
  bugId: string,
  db: Db = prisma,
): Promise<{ repro: ReproView | null; waiting: RevalidationView[]; revalidated: RevalidationView[] }> {
  const [repro, rows] = await Promise.all([
    db.issueRepro.findUnique({ where: { bugId }, select: reproSelect }),
    db.issueRevalidation.findMany({
      where: { bugId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: revalidationSelect,
    }),
  ]);
  const views = rows.map(revalidationView);
  return {
    repro: reproView(repro),
    waiting: views.filter((row) => row.verdict === null).sort((a, b) => a.askedAt.getTime() - b.askedAt.getTime()),
    revalidated: views.filter((row) => row.verdict !== null),
  };
}

/**
 * The issue's repro profile and re-checks, by the reference a route receives,
 * in the caller's scope: another project's issue is a 404.
 */
export async function revalidationFor(
  scope: { organisationId: string; projectId: string },
  issueRef: string,
): Promise<{ repro: ReproView | null; waiting: RevalidationView[]; revalidated: RevalidationView[] }> {
  const bugId = await issueIdFor(prisma, issueRef, scope.organisationId);
  if (!bugId) throw new IssueApiError(404, "Issue not found.");
  const bug = await prisma.bug.findFirst({
    where: { id: bugId, ...scope, isDeleted: false },
    select: { id: true },
  });
  if (!bug) throw new IssueApiError(404, "Issue not found.");
  return revalidationForIssue(bug.id);
}

/** A re-check still to be given, with the issue, for the work feed. */
export type WaitingRevalidation = {
  id: string;
  bug: Omit<IssueForRevalidation, "claims" | "createdByAgent"> & { pullRequestUrl: string | null };
  /** The agent that reported the change: it can't answer its own re-check. */
  reportedByAgentId: string;
  commitSha: string | null;
  pullRequestUrl: string | null;
  matchedPaths: string[];
  trigger: RevalidationTrigger;
  askedAt: Date;
};

/** Every re-check waiting in a project, oldest first: the `revalidate_issue` items in the work feed. */
export async function waitingRevalidations(projectId: string, take = 25, db: Db = prisma): Promise<WaitingRevalidation[]> {
  const rows = await db.issueRevalidation.findMany({
    where: {
      verdict: null,
      bug: { projectId, isDeleted: false, status: { not: "closed" } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      trigger: true,
      pullRequestUrl: true,
      commitSha: true,
      matchedPaths: true,
      agentId: true,
      createdAt: true,
      bug: { select: { ...issueForRevalidation, claims: false, createdByAgent: false } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    bug: row.bug,
    trigger: row.trigger,
    pullRequestUrl: row.pullRequestUrl,
    reportedByAgentId: row.agentId,
    commitSha: row.commitSha,
    matchedPaths: row.matchedPaths,
    askedAt: row.createdAt,
  }));
}

const fail = <S extends 400 | 403 | 404 | 409>(status: S, error: string, message: string, field?: string) =>
  ({ status, body: { error, message, ...(field ? { field } : {}) } }) as const;

function invalid(issues: { readonly path: readonly PropertyKey[]; message: string }[]) {
  const issue = issues[0];
  const field = typeof issue?.path[0] === "string" ? (issue.path[0] as string) : undefined;
  return fail(400, "invalid_request", issue?.message ?? "Invalid request.", field);
}

export type ReproResult =
  | { status: 201; body: { repro: ReproView } }
  | { status: 400 | 403 | 404 | 409; body: { error: string; message: string; field?: string } };

/**
 * `POST /api/v1/issues/{id}/repro`: the agent records the issue's repro
 * profile. One profile per issue; recording it again replaces it, so a report
 * that moved is corrected rather than duplicated.
 */
export async function recordIssueRepro(
  agent: AgentContext,
  scope: { organisationId: string; projectId: string },
  issueRef: string,
  rawBody: unknown,
): Promise<ReproResult> {
  const parsed = reproSchema.safeParse(rawBody ?? {});
  if (!parsed.success) return invalid(parsed.error.issues);
  const body = parsed.data;

  const bugId = await issueIdFor(prisma, issueRef, scope.organisationId);
  if (!bugId) return fail(404, "not_found", "No such issue in this project.");
  const bug = await prisma.bug.findFirst({
    where: { id: bugId, ...scope, isDeleted: false },
    select: { id: true, organisationId: true, projectId: true, status: true },
  });
  if (!bug) return fail(404, "not_found", "No such issue in this project.");
  if (bug.status === "closed") {
    return fail(409, "issue_closed", "This issue is closed; a closed report asks for no repro profile.");
  }

  const saved = await prisma.$transaction(async (tx) => {
    const repro = await tx.issueRepro.upsert({
      where: { bugId: bug.id },
      create: {
        bugId: bug.id,
        affectedPaths: body.affectedPaths,
        affectedEndpoints: body.affectedEndpoints,
        steps: body.steps,
        expected: body.expected,
        actual: body.actual,
        commitSha: body.commitSha ?? null,
        agentId: agent.agentId,
        onBehalfOfUserId: agent.ownerId,
      },
      update: {
        affectedPaths: body.affectedPaths,
        affectedEndpoints: body.affectedEndpoints,
        steps: body.steps,
        expected: body.expected,
        actual: body.actual,
        commitSha: body.commitSha ?? null,
        agentId: agent.agentId,
        onBehalfOfUserId: agent.ownerId,
      },
      select: reproSelect,
    });
    const payload: Prisma.InputJsonObject = {
      issueId: bug.id,
      projectId: bug.projectId,
      affectedPaths: body.affectedPaths,
      affectedEndpoints: body.affectedEndpoints,
      commitSha: body.commitSha ?? null,
    };
    await audit(agent, "issue.repro_recorded", `bug:${bug.id}`, payload, { bugId: bug.id, db: tx });
    await publish(tx, { organisationId: bug.organisationId, type: "issue.repro_recorded", payload, actorAgentId: agent.agentId, bugId: bug.id });
    return repro;
  });

  return { status: 201, body: { repro: reproView(saved)! } };
}

export type CodeChangeResult =
  | {
      status: 201;
      body: {
        change: { commitSha: string; pullRequestUrl: string | null; changedPaths: string[] };
        affected: {
          issueId: string;
          number: number;
          title: string;
          status: string;
          substatus: string;
          matchedPaths: string[];
          /** False when this commit was already reported for the issue. */
          asked: boolean;
        }[];
      };
    }
  | { status: 400 | 403 | 404; body: { error: string; message: string; field?: string } };

/**
 * `POST /api/v1/projects/{id}/code-changes`: an agent reports the paths a
 * change touched — from a pull request it read on GitHub, a commit, or a diff
 * it made. Ziki matches them against every open issue's repro profile (a
 * closed issue asks for nothing) and asks for a re-check on each match.
 *
 * The issue's own pull request is not a re-check trigger: it is the fix, and
 * the issue already moves through Delivered and Merge for it. Reporting the
 * same commit again does not reopen a re-check that was already given: one row
 * per issue per commit, and its verdict stands.
 */
export async function reportCodeChange(
  agent: AgentContext,
  scope: { organisationId: string; projectId: string },
  rawBody: unknown,
): Promise<CodeChangeResult> {
  const parsed = codeChangeSchema.safeParse(rawBody ?? {});
  if (!parsed.success) return invalid(parsed.error.issues);
  const body = parsed.data;
  const project = await prisma.project.findFirst({
    where: { id: scope.projectId, organisationId: scope.organisationId },
    select: { id: true },
  });
  if (!project) return fail(404, "not_found", "No such project.");
  const commitSha = body.commitSha.toLowerCase();
  const pullRequestUrl = body.pullRequestUrl ?? null;
  const trigger: RevalidationTrigger = pullRequestUrl ? "pull_request" : "commit";

  const repros = await prisma.issueRepro.findMany({
    where: {
      bug: { ...scope, isDeleted: false, status: { not: "closed" } },
    },
    select: {
      bugId: true,
      affectedPaths: true,
      affectedEndpoints: true,
      bug: {
        select: {
          id: true,
          organisationId: true,
          number: true,
          title: true,
          status: true,
          substatus: true,
          pullRequestUrl: true,
        },
      },
    },
  });

  const affected: {
    issueId: string;
    number: number;
    title: string;
    status: string;
    substatus: string;
    matchedPaths: string[];
    asked: boolean;
  }[] = [];
  const asked: { bug: (typeof repros)[number]["bug"]; matched: string[]; created: boolean }[] = [];

  for (const repro of repros) {
    if (ownFix(repro.bug.pullRequestUrl, pullRequestUrl)) continue;
    const matched = matchedAreas(
      { affectedPaths: repro.affectedPaths, affectedEndpoints: repro.affectedEndpoints },
      body.changedPaths,
    );
    if (matched.length === 0) continue;
    affected.push({
      issueId: repro.bug.id,
      number: repro.bug.number,
      title: repro.bug.title,
      status: repro.bug.status,
      substatus: repro.bug.substatus,
      matchedPaths: matched,
      // Filled in below, once the row is written.
      asked: false,
    });
    asked.push({ bug: repro.bug, matched, created: false });
  }

  if (asked.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < asked.length; i++) {
        const entry = asked[i];
        const existing = await tx.issueRevalidation.findUnique({
          where: { bugId_commitSha: { bugId: entry.bug.id, commitSha } },
          select: { id: true },
        });
        if (existing) continue;
        const row = await tx.issueRevalidation.create({
          data: {
            bugId: entry.bug.id,
            trigger,
            pullRequestUrl,
            commitSha,
            changedPaths: body.changedPaths,
            matchedPaths: entry.matched,
            agentId: agent.agentId,
            onBehalfOfUserId: agent.ownerId,
          },
          select: { id: true },
        });
        entry.created = true;
        const payload: Prisma.InputJsonObject = {
          issueId: entry.bug.id,
          projectId: scope.projectId,
          revalidationId: row.id,
          trigger,
          pullRequestUrl,
          commitSha,
          matchedPaths: entry.matched,
          changedPaths: body.changedPaths,
        };
        await audit(agent, "issue.revalidation_asked", `bug:${entry.bug.id}`, payload, { bugId: entry.bug.id, db: tx });
        await publish(tx, {
          organisationId: entry.bug.organisationId,
          type: "issue.revalidation_asked",
          payload,
          actorAgentId: agent.agentId,
          bugId: entry.bug.id,
        });
      }
      const payload: Prisma.InputJsonObject = {
        projectId: scope.projectId,
        commitSha,
        pullRequestUrl,
        changedPaths: body.changedPaths,
        affected: affected.length,
        ...(body.note ? { note: body.note } : {}),
      };
      await audit(agent, "project.code_change_reported", `project:${scope.projectId}`, payload, { db: tx });
    });
  }

  for (let i = 0; i < affected.length; i++) affected[i].asked = asked[i].created;

  return {
    status: 201,
    body: { change: { commitSha, pullRequestUrl, changedPaths: body.changedPaths }, affected },
  };
}

export type RevalidationResult =
  | { status: 201; body: { revalidation: RevalidationView } }
  | { status: 400 | 403 | 404 | 409; body: { error: string; message: string; field?: string } };

/**
 * `POST /api/v1/issues/{id}/revalidation`: an agent re-checks a flagged issue
 * and says what it found. It never moves the issue; closing a stale report
 * stays a person's decision, with this as the evidence.
 *
 * The agent that reported the change answers no re-check of it, and neither
 * does the one holding the claim (the reviewer rule): the point is a fresh
 * look at someone else's work.
 */
export async function giveRevalidation(
  agent: AgentContext,
  scope: { organisationId: string; projectId: string },
  issueRef: string,
  rawBody: unknown,
): Promise<RevalidationResult> {
  const parsed = revalidationSchema.safeParse(rawBody ?? {});
  if (!parsed.success) return invalid(parsed.error.issues);
  const body = parsed.data;

  const bugId = await issueIdFor(prisma, issueRef, scope.organisationId);
  if (!bugId) return fail(404, "not_found", "No such issue in this project.");
  const bug = await prisma.bug.findFirst({
    where: { id: bugId, ...scope, isDeleted: false },
    select: issueForRevalidation,
  });
  if (!bug) return fail(404, "not_found", "No such issue in this project.");
  if (bug.status === "closed") {
    return fail(409, "issue_closed", "This issue is closed; it asks for no re-check.");
  }

  const conflict = reviewerConflict({ id: agent.agentId, ownerUserId: agent.ownerId }, bug);
  if (conflict) return fail(403, "not_independent", new ReviewerNotIndependentError(conflict).message);

  const commitSha = body.commitSha?.toLowerCase() ?? null;
  const existing = commitSha
    ? await prisma.issueRevalidation.findUnique({
        where: { bugId_commitSha: { bugId: bug.id, commitSha } },
        select: { id: true, agentId: true },
      })
    : null;
  if (existing && existing.agentId === agent.agentId) {
    return fail(
      403,
      "not_independent",
      "This agent reported the change that asked for this re-check, so another agent re-checks it, your owner's other agents included.",
    );
  }

  const saved = await prisma.$transaction(async (tx) => {
    const data = {
      verdict: body.verdict,
      summary: body.summary,
      description: body.description,
      verdictAgentId: agent.agentId,
      verdictOnBehalfOfUserId: agent.ownerId,
      verdictAt: new Date(),
    };
    // One row per issue per commit: answering again replaces this commit's
    // answer. Without a commit, each re-check by hand is its own row.
    const revalidation = existing
      ? await tx.issueRevalidation.update({ where: { id: existing.id }, data, select: revalidationSelect })
      : await tx.issueRevalidation.create({
          data: {
            bugId: bug.id,
            trigger: "manual",
            pullRequestUrl: bug.pullRequestUrl,
            commitSha,
            matchedPaths: [],
            agentId: agent.agentId,
            onBehalfOfUserId: agent.ownerId,
            ...data,
          },
          select: revalidationSelect,
        });
    const payload: Prisma.InputJsonObject = {
      issueId: bug.id,
      projectId: bug.projectId,
      revalidationId: revalidation.id,
      commitSha,
      verdict: body.verdict,
      summary: body.summary,
      description: body.description,
    };
    await audit(agent, "issue.revalidated", `bug:${bug.id}`, payload, { bugId: bug.id, db: tx });
    await publish(tx, {
      organisationId: bug.organisationId,
      type: "issue.revalidated",
      payload,
      actorAgentId: agent.agentId,
      bugId: bug.id,
    });
    return revalidation;
  });

  return { status: 201, body: { revalidation: revalidationView(saved) } };
}
