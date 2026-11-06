import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agents/require-agent";
import { publish } from "@/lib/agent-api/events";
import { issueIdFor } from "@/lib/issue-ref";
import { moveTo } from "@/lib/issue-substatus";
import {
  consolidateJudgingFeedback,
  countJudgingVotes,
  judgingIneligibility,
  judgingStatus,
  resolveJudgingQuorum,
  validateJudgingSubmission,
  type JudgingChecks,
  type JudgingEvidence,
  type JudgingOutcome,
} from "@/lib/judging/rules";

type ServiceError = {
  status: 403 | 404 | 409 | 422;
  error: string;
  message: string;
  errors?: string[];
};

export type JudgingActor = Pick<AgentContext, "agentId" | "ownerId" | "tenantId" | "level" | "projectId">;

type JudgingEventView = {
  id: string;
  type: string;
  outcome: JudgingOutcome | null;
  agentName: string;
  ownerName: string;
  createdAt: Date;
  deliveryRound: number;
};

export type JudgingView = {
  issue: {
    id: string;
    number: number;
    title: string;
    summary: string | null;
    description: string;
    proofLinks: string[];
    status: string;
    substatus: string;
  };
  delivery: {
    id: string;
    round: number;
    state: "open" | "passed" | "rejected";
    pullRequestUrl: string | null;
    summary: string;
    description: string;
    screenshots: string[];
    testResults: string | null;
    deliverableUrls: string[];
  };
  claimHolder: { agentName: string; ownerName: string };
  feedback: {
    checkFailures?: Partial<Record<keyof JudgingChecks, number>>;
    notes?: Array<{ agentName: string; ownerName: string; notes: string }>;
  } | null;
  verdictsSubmitted: number;
  counts?: { approvals: number; sendBacks: number; approveQuorum: number; sendBackQuorum: number };
  verdicts?: Array<{
    id: string;
    outcome: JudgingOutcome;
    checks: JudgingChecks;
    evidence: JudgingEvidence[];
    notes: string;
    agentName: string;
    ownerName: string;
    createdAt: Date;
  }>;
  history: JudgingEventView[];
  canJudge: boolean;
  reason: string | null;
};

type ServiceResult<T> = { status: 200 | 201; view: T } | ServiceError;

const issueSelect = {
  id: true,
  number: true,
  tenantId: true,
  projectId: true,
  title: true,
  summary: true,
  description: true,
  proofLinks: true,
  status: true,
  substatus: true,
  judgingFeedback: true,
  deliveries: {
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      id: true,
      judgingState: true,
      judgingRound: true,
      headSha: true,
      pullRequestUrl: true,
      summary: true,
      description: true,
      screenshots: true,
      testResults: true,
      deliverableUrls: true,
      agentId: true,
      agent: { select: { name: true, ownerUserId: true } },
      beneficiary: { select: { name: true } },
    },
  },
  claims: {
    where: { status: "active", releasedAt: null },
    take: 1,
    select: {
      agentId: true,
      agent: { select: { name: true, ownerUserId: true, owner: { select: { name: true } } } },
    },
  },
} satisfies Prisma.BugSelect;

type LoadedIssue = Prisma.BugGetPayload<{ select: typeof issueSelect }>;

const reasonMessages: Record<string, string> = {
  not_tester: "Only a working tester agent can judge this delivery. Use a tester agent key.",
  judging_closed: "Judging is closed for this delivery. A new delivery is needed before another verdict.",
  own_work: "The agent who delivered this work cannot judge it. Use an independent tester agent.",
  same_owner: "The delivery agent and tester share an owner. Use an agent from a different owner.",
  already_judged: "This agent or its owner already submitted a verdict for this delivery round.",
};

function agentRole(agent: JudgingActor): string {
  return agent.level === "working" ? "tester" : agent.level;
}

function activeDelivery(issue: LoadedIssue) {
  return issue.deliveries[0] ?? null;
}

function holder(issue: LoadedIssue, delivery: NonNullable<ReturnType<typeof activeDelivery>>) {
  const claim = issue.claims[0];
  return {
    agentId: claim?.agentId ?? delivery.agentId,
    ownerId: claim?.agent.ownerUserId ?? delivery.agent.ownerUserId,
    agentName: claim?.agent.name ?? delivery.agent.name,
    ownerName: claim?.agent.owner.name ?? delivery.beneficiary.name ?? "Unknown owner",
  };
}

function effectiveClosed(issue: LoadedIssue, delivery: NonNullable<ReturnType<typeof activeDelivery>>): boolean {
  return delivery.judgingState !== "open" || issue.status !== "done" || issue.substatus !== "requires_review";
}

async function findIssue(agent: JudgingActor, issueRef: string): Promise<LoadedIssue | ServiceError> {
  const bugId = await issueIdFor(prisma, issueRef, agent.tenantId);
  if (!bugId) return { status: 404, error: "not_found", message: "We couldn't find this issue in your workspace." };
  const issue = await prisma.bug.findFirst({
    where: {
      id: bugId,
      tenantId: agent.tenantId,
      isDeleted: false,
      ...(agent.projectId ? { projectId: agent.projectId } : {}),
    },
    select: issueSelect,
  });
  if (!issue) return { status: 404, error: "not_found", message: "We couldn't find this issue in your workspace." };
  if (agent.projectId && issue.projectId !== agent.projectId) {
    return { status: 403, error: "project_forbidden", message: "This agent key is restricted to another project." };
  }
  return issue;
}

function isServiceError(value: LoadedIssue | ServiceError): value is ServiceError {
  return "status" in value && "error" in value;
}

function eligibilityError(agent: JudgingActor, issue: LoadedIssue, delivery: NonNullable<ReturnType<typeof activeDelivery>>, verdicts: Array<{ agentId: string; ownerId: string }>): ServiceError | null {
  const claimHolder = holder(issue, delivery);
  const reason = judgingIneligibility({
    role: agentRole(agent),
    agentId: agent.agentId,
    ownerId: agent.ownerId,
    claimHolderAgentId: claimHolder.agentId,
    claimHolderOwnerId: claimHolder.ownerId,
    judgedAgentIds: verdicts.map((verdict) => verdict.agentId),
    judgedOwnerIds: verdicts.map((verdict) => verdict.ownerId),
    closed: effectiveClosed(issue, delivery),
  });
  if (!reason) return null;
  const status = reason === "not_tester" || reason === "own_work" || reason === "same_owner" ? 403 : 409;
  return { status, error: reason, message: reasonMessages[reason] };
}

async function buildView(agent: JudgingActor, issue: LoadedIssue): Promise<ServiceResult<JudgingView>> {
  const delivery = activeDelivery(issue);
  if (!delivery) {
    return { status: 404, error: "no_delivery", message: "No delivery is ready for judging yet. Come back after the claim holder delivers the work." };
  }

  const [verdicts, history, workflow] = await Promise.all([
    prisma.judgingVerdict.findMany({
      where: { deliveryId: delivery.id, deliveryRound: delivery.judgingRound },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        agentId: true,
        ownerId: true,
        approved: true,
        checks: true,
        evidence: true,
        notes: true,
        createdAt: true,
        agent: { select: { name: true } },
        owner: { select: { name: true } },
      },
    }),
    prisma.judgingEvent.findMany({
      where: { bugId: issue.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        outcome: true,
        deliveryRound: true,
        createdAt: true,
        agent: { select: { name: true } },
        owner: { select: { name: true } },
      },
    }),
    prisma.projectWorkflow.findUnique({
      where: { projectId: issue.projectId },
      select: { judgePassQuorum: true, judgeRejectQuorum: true },
    }),
  ]);
  const votes = verdicts.map((verdict) => ({
    ownerId: verdict.ownerId,
    outcome: verdict.approved ? "approve" as const : "send_back" as const,
  }));
  const ownVerdict = verdicts.some((verdict) => verdict.agentId === agent.agentId);
  const closed = effectiveClosed(issue, delivery);
  const reveal = ownVerdict || closed;
  const counts = reveal ? countJudgingVotes(votes) : null;
  const eligibility = eligibilityError(agent, issue, delivery, verdicts);
  const claimHolder = holder(issue, delivery);

  return {
    status: 200,
    view: {
      issue: {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        summary: issue.summary,
        description: issue.description,
        proofLinks: issue.proofLinks,
        status: issue.status,
        substatus: issue.substatus,
      },
      delivery: {
        id: delivery.id,
        round: delivery.judgingRound,
        state: delivery.judgingState as "open" | "passed" | "rejected",
        pullRequestUrl: delivery.pullRequestUrl,
        summary: delivery.summary,
        description: delivery.description,
        screenshots: delivery.screenshots,
        testResults: delivery.testResults,
        deliverableUrls: delivery.deliverableUrls,
      },
      claimHolder: { agentName: claimHolder.agentName, ownerName: claimHolder.ownerName },
      feedback: issue.judgingFeedback as JudgingView["feedback"],
      verdictsSubmitted: verdicts.length,
      ...(counts
        ? {
            counts: {
              approvals: counts.approvals,
              sendBacks: counts.sendBacks,
              approveQuorum: workflow?.judgePassQuorum ?? 2,
              sendBackQuorum: workflow?.judgeRejectQuorum ?? 2,
            },
            verdicts: verdicts.map((verdict) => ({
              id: verdict.id,
              outcome: verdict.approved ? "approve" as const : "send_back" as const,
              checks: verdict.checks as JudgingChecks,
              evidence: verdict.evidence as JudgingEvidence[],
              notes: verdict.notes,
              agentName: verdict.agent.name,
              ownerName: verdict.owner.name ?? "A member",
              createdAt: verdict.createdAt,
            })),
          }
        : {}),
      history: history.map((event) => ({
        id: event.id,
        type: event.type,
        outcome: reveal ? (event.outcome as JudgingOutcome | null) : null,
        agentName: event.agent.name,
        ownerName: event.owner.name ?? "A member",
        createdAt: event.createdAt,
        deliveryRound: event.deliveryRound,
      })),
      canJudge: eligibility === null,
      reason: eligibility?.error === "already_judged"
        ? "already_judged"
        : closed
          ? "judging_closed"
          : eligibility?.error ?? null,
    },
  };
}

export async function getJudgingView(agent: JudgingActor, issueRef: string): Promise<ServiceResult<JudgingView>> {
  if (agent.level !== "working") {
    return { status: 403, error: "not_tester", message: reasonMessages.not_tester };
  }
  const issue = await findIssue(agent, issueRef);
  if (isServiceError(issue)) return issue;
  const result = await buildView(agent, issue);
  if (result.status === 200 && (result.view.reason === "own_work" || result.view.reason === "same_owner")) {
    return {
      status: 403,
      error: result.view.reason,
      message: reasonMessages[result.view.reason],
    };
  }
  return result;
}

export async function submitJudgingVerdict(
  agent: JudgingActor,
  issueRef: string,
  rawBody: unknown,
): Promise<ServiceResult<JudgingView>> {
  if (agent.level !== "working") {
    return { status: 403, error: "not_tester", message: reasonMessages.not_tester };
  }
  const parsed = validateJudgingSubmission(rawBody);
  if (!parsed.success) {
    return {
      status: 422,
      error: "invalid_verdict",
      message: "Fix the listed issues before submitting your verdict.",
      errors: parsed.errors,
    };
  }

  const issue = await findIssue(agent, issueRef);
  if (isServiceError(issue)) return issue;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Bug" WHERE "id" = ${issue.id} FOR UPDATE`;
      const current = await tx.bug.findFirst({
        where: { id: issue.id, tenantId: agent.tenantId, isDeleted: false },
        select: issueSelect,
      });
      if (!current) return { error: "not_found", status: 404 as const, message: "We couldn't find this issue in your workspace." };
      const delivery = activeDelivery(current);
      if (!delivery) return { error: "no_delivery", status: 404 as const, message: "No delivery is ready for judging yet. Come back after the claim holder delivers the work." };

      const existing = await tx.judgingVerdict.findMany({
        where: { deliveryId: delivery.id, deliveryRound: delivery.judgingRound },
        select: { agentId: true, ownerId: true },
      });
      const blocked = eligibilityError(agent, current, delivery, existing);
      if (blocked) return blocked;

      const submission = parsed.data;
      const verdict = await tx.judgingVerdict.create({
        data: {
          bugId: current.id,
          deliveryId: delivery.id,
          deliveryRound: delivery.judgingRound,
          agentId: agent.agentId,
          ownerId: agent.ownerId,
          headSha: delivery.headSha,
          approved: submission.outcome === "approve",
          checks: submission.checks,
          evidence: submission.evidence,
          notes: submission.notes,
        },
        select: { id: true, createdAt: true },
      });
      await tx.judgingEvent.create({
        data: {
          bugId: current.id,
          deliveryId: delivery.id,
          deliveryRound: delivery.judgingRound,
          type: "verdict_submitted",
          outcome: submission.outcome,
          agentId: agent.agentId,
          ownerId: agent.ownerId,
          createdAt: verdict.createdAt,
        },
      });
      await publish(tx, {
        tenantId: current.tenantId,
        type: "issue.judging_verdict",
        payload: {
          issueId: current.id,
          deliveryId: delivery.id,
          deliveryRound: delivery.judgingRound,
          verdictId: verdict.id,
          outcome: submission.outcome,
          agentId: agent.agentId,
          ownerId: agent.ownerId,
        },
        actorAgentId: agent.agentId,
        bugId: current.id,
      });

      const rows = await tx.judgingVerdict.findMany({
        where: { deliveryId: delivery.id, deliveryRound: delivery.judgingRound },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          ownerId: true,
          approved: true,
          checks: true,
          notes: true,
          agent: { select: { name: true } },
          owner: { select: { name: true } },
        },
      });
      const workflow = await tx.projectWorkflow.findUnique({
        where: { projectId: current.projectId },
        select: { judgePassQuorum: true, judgeRejectQuorum: true },
      });
      const thresholds = {
        approve: workflow?.judgePassQuorum ?? 2,
        send_back: workflow?.judgeRejectQuorum ?? 2,
      };
      const replay = resolveJudgingQuorum(
        rows.map((row) => ({ ownerId: row.ownerId, outcome: row.approved ? "approve" as const : "send_back" as const })),
        thresholds,
      );

      if (replay) {
        const status = judgingStatus(replay.outcome);
        await tx.delivery.update({
          where: { id: delivery.id },
          data: {
            judgingState: status.deliveryState,
            ...(replay.outcome === "approve" ? { judgedHeadSha: delivery.headSha } : {}),
          },
        });
        if (replay.outcome === "send_back") {
          const feedback = consolidateJudgingFeedback(rows.map((row) => ({
            outcome: row.approved ? "approve" as const : "send_back" as const,
            checks: row.checks as JudgingChecks,
            notes: row.notes,
            agentName: row.agent.name,
            ownerName: row.owner.name ?? "A member",
          })));
          await tx.bug.update({
            where: { id: current.id },
            data: {
              ...moveTo("open"),
              assigneeId: null,
              pullRequestUrl: null,
              pullRequestHeadSha: null,
              judgingFeedback: feedback,
            },
          });
          const releasedAt = new Date();
          const releasedClaims = await tx.issueClaim.findMany({
            where: { bugId: current.id, status: "active", releasedAt: null },
            select: { id: true, agentId: true, beneficiaryUserId: true },
          });
          await tx.issueClaim.updateMany({
            where: { bugId: current.id, status: "active", releasedAt: null },
            data: { status: "released", releasedAt, releaseReason: "judged_not_good" },
          });
          for (const claim of releasedClaims) {
            await publish(tx, {
              tenantId: current.tenantId,
              type: "claim.released",
              actorAgentId: agent.agentId,
              bugId: current.id,
              payload: { claimId: claim.id, agentId: claim.agentId, issueId: current.id, beneficiaryUserId: claim.beneficiaryUserId, reason: "judged_not_good" },
            });
          }
        } else {
          await tx.bug.update({
            where: { id: current.id },
            data: moveTo("requires_review"),
          });
        }
        await tx.judgingEvent.create({
          data: {
            bugId: current.id,
            deliveryId: delivery.id,
            deliveryRound: delivery.judgingRound,
            type: status.deliveryState,
            outcome: replay.outcome,
            agentId: agent.agentId,
            ownerId: agent.ownerId,
          },
        });
        await tx.bugActivity.create({
          data: {
            bugId: current.id,
            actorId: agent.ownerId,
            type: "status_changed",
            summary: replay.outcome === "approve"
              ? "Tester quorum passed the delivery; it is ready for review."
              : "Tester quorum sent the delivery back; the claim was released.",
            metadata: {
              field: "judging",
              deliveryId: delivery.id,
              deliveryRound: delivery.judgingRound,
              outcome: replay.outcome,
              approvals: replay.approvals,
              sendBacks: replay.sendBacks,
              approveQuorum: thresholds.approve,
              sendBackQuorum: thresholds.send_back,
            },
          },
        });
      }

      return { status: 201 as const };
    }, { maxWait: 10_000, timeout: 15_000 });

    if ("error" in result) return result;
    const updated = await findIssue(agent, issueRef);
    if (isServiceError(updated)) return updated;
    const view = await buildView(agent, updated);
    return view.status === 200 ? { ...view, status: 201 } : view;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: 409,
        error: "already_judged",
        message: "This agent or its owner already submitted a verdict for this delivery round.",
      };
    }
    throw error;
  }
}
