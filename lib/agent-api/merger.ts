import { trackFilter } from "@/lib/marketing/track";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agents/require-agent";
import { requireLevel } from "@/lib/agents/levels";
import { confirmedIssueIds } from "@/lib/issue-stage";
import { countedMergeVerdicts, deliveredClaim } from "@/lib/agent-api/merge-verdicts";
import { reviewerConflict } from "@/lib/agents/independence";
import { workflowFor } from "@/lib/workflow";
import type { WorkTrack } from "@prisma/client";

/**
 * The two merge queues (#substatus): tested fixes waiting for a manager's
 * accept (Done · Accepted), and accepted ones waiting to merge (Merge: Ready
 * to merge or Error).
 */
export type MergeQueueStatus = "accepted" | "merge";

const queueWhere = (queue: MergeQueueStatus) => (queue === "accepted"
  ? {
      OR: [
        { substatus: "accepted" as const },
        { substatus: "requires_review" as const, deliveries: { some: { judgingState: "passed" } } },
      ],
    }
  : { status: "merge" as const });

function passedWorkbenchVotes(delivery: {
  judgingState: string;
  judgingRound: number;
  judgingVerdicts: Array<{ ownerId: string; deliveryRound: number }>;
} | undefined): number | null {
  if (!delivery || delivery.judgingState !== "passed") return null;
  return new Set(
    delivery.judgingVerdicts
      .filter((verdict) => verdict.deliveryRound === delivery.judgingRound)
      .map((verdict) => verdict.ownerId),
  ).size;
}

const judgingDeliverySelect = {
  orderBy: [{ updatedAt: "desc" as const }, { id: "desc" as const }],
  take: 1,
  select: {
    judgingState: true,
    judgingRound: true,
    judgingVerdicts: {
      where: { approved: true },
      select: { ownerId: true, deliveryRound: true },
    },
  },
};

export type ReadyToMergeIssue = {
  id: string;
  number: number;
  title: string;
  projectId: string;
  pullRequestUrl: string | null;
  pullRequestHeadSha: string | null;
  status: MergeQueueStatus;
  claim: {
    agentId: string;
    beneficiaryUserId: string;
  } | null;
  verdictsCount: number;
  createdAt: Date;
};

/**
 * Confirmed issues with a linked pull request at one merge step, that this
 * agent is independent of: `accepted` (tested, waiting for a manager's accept,
 * which also needs enough independent good-to-merge verdicts on the linked
 * pull request) or `merge` (accepted, waiting for the merge, Error
 * included).
 */
export async function findReadyToMergeIssues(
  agent: AgentContext,
  projectId: string,
  status: MergeQueueStatus,
  track: WorkTrack = "product",
): Promise<ReadyToMergeIssue[]> {
  requireLevel(agent, "manager");
  const { verdictsNeeded } = await workflowFor(projectId);

  if (track === "marketing") {
    // Marketing skips the merge queue entirely; only accepted fixes waiting for a manager exist.
    if (status === "merge") return [];

    const candidates = await prisma.bug.findMany({
      where: {
        tenantId: agent.tenantId,
        projectId,
        ...trackFilter(track),
        isDeleted: false,
        ...queueWhere(status),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        number: true,
        title: true,
        substatus: true,
        projectId: true,
        pullRequestUrl: true,
        pullRequestHeadSha: true,
        reporterId: true,
        beneficiaryUserId: true,
        assigneeId: true,
        createdByAgentId: true,
        createdByAgent: { select: { ownerUserId: true } },
        createdAt: true,
        claims: {
          select: {
            status: true,
            claimedAt: true,
            releasedAt: true,
            agentId: true,
            beneficiaryUserId: true,
            dispatcherUserId: true,
            agent: { select: { ownerUserId: true } },
          },
        },
        testVerdicts: {
          where: { goodToMerge: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            headSha: true,
            onBehalfOfUserId: true,
            pullRequestUrl: true,
            agent: { select: { id: true, ownerUserId: true, level: true } },
          },
        },
        deliveries: judgingDeliverySelect,
      },
    });

    const ready: ReadyToMergeIssue[] = [];
    for (const bug of candidates) {
      const claim = deliveredClaim(bug);
      const delivery = bug.deliveries[0];
      const judgedCount = passedWorkbenchVotes(delivery);
      const weight = judgedCount ?? countedMergeVerdicts(bug.testVerdicts, claim, bug).weight;
      if (status === "accepted" && bug.substatus === "accepted" && judgedCount === null && weight < verdictsNeeded) continue;
      if (status === "accepted" && bug.substatus === "requires_review" && judgedCount === null) continue;
      if (reviewerConflict({ id: agent.agentId, ownerUserId: agent.ownerId }, bug)) continue;

      ready.push({
        id: bug.id,
        number: bug.number,
        title: bug.title,
        projectId: bug.projectId,
        pullRequestUrl: bug.pullRequestUrl ?? null,
        pullRequestHeadSha: bug.pullRequestHeadSha,
        status,
        claim: claim ? { agentId: claim.agentId, beneficiaryUserId: claim.beneficiaryUserId } : null,
        verdictsCount: weight,
        createdAt: bug.createdAt,
      });
    }
    return ready;
  }

  // Confirmation from one bulk read, not one isConfirmed() per row (#714).
  const confirmed = await confirmedIssueIds(prisma, {
    ...trackFilter(track),
    tenantId: agent.tenantId,
    projectId,
    ...queueWhere(status),
    pullRequestUrl: { not: null },
  });
  if (confirmed.size === 0) return [];

  // Fixes in review are few, so read them all (the work feed has no cap).
  const candidates = await prisma.bug.findMany({
    where: {
      id: { in: [...confirmed] },
      tenantId: agent.tenantId,
      projectId,
      ...trackFilter(track),
      isDeleted: false,
      ...queueWhere(status),
      pullRequestUrl: { not: null },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      number: true,
      title: true,
      substatus: true,
      projectId: true,
      pullRequestUrl: true,
      pullRequestHeadSha: true,
      reporterId: true,
      beneficiaryUserId: true,
      assigneeId: true,
      createdByAgentId: true,
      createdByAgent: { select: { ownerUserId: true } },
      createdAt: true,
      claims: {
        select: {
          status: true,
          claimedAt: true,
          releasedAt: true,
          agentId: true,
          beneficiaryUserId: true,
          dispatcherUserId: true,
          agent: { select: { ownerUserId: true } },
        },
      },
      testVerdicts: {
        where: { goodToMerge: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          headSha: true,
          onBehalfOfUserId: true,
          pullRequestUrl: true,
          agent: { select: { id: true, ownerUserId: true, level: true } },
        },
      },
      deliveries: judgingDeliverySelect,
    },
  });

  const ready: ReadyToMergeIssue[] = [];
  for (const bug of candidates) {
    const claim = deliveredClaim(bug);
    // The same verdict rule as the merge gate (merge.ts), on the linked PR only.
    const onLinkedPr = bug.testVerdicts.filter((verdict) => verdict.pullRequestUrl === bug.pullRequestUrl);
    const delivery = bug.deliveries[0];
    const judgedCount = passedWorkbenchVotes(delivery);
    const weight = judgedCount ?? countedMergeVerdicts(onLinkedPr, claim, bug).weight;

    if (status === "accepted" && bug.substatus === "accepted" && judgedCount === null && weight < verdictsNeeded) continue;
    if (status === "accepted" && bug.substatus === "requires_review" && judgedCount === null) continue;

    if (reviewerConflict({ id: agent.agentId, ownerUserId: agent.ownerId }, bug)) continue;

    ready.push({
      id: bug.id,
      number: bug.number,
      title: bug.title,
      projectId: bug.projectId,
      pullRequestUrl: bug.pullRequestUrl!,
      pullRequestHeadSha: bug.pullRequestHeadSha,
      status,
      claim: claim ? { agentId: claim.agentId, beneficiaryUserId: claim.beneficiaryUserId } : null,
      verdictsCount: weight,
      createdAt: bug.createdAt,
    });
  }

  return ready;
}
