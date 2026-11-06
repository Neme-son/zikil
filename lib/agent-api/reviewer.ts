import { trackFilter } from "@/lib/marketing/track";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agents/require-agent";
import { requireLevel } from "@/lib/agents/levels";
import type { WorkTrack } from "@prisma/client";

export type ReviewType = "confirmation" | "test";

export type ReviewableIssue = {
  id: string;
  number: number;
  title: string;
  projectId: string;
  stage: "ready";
  reviewType: ReviewType;
  pullRequestUrl?: string | null;
  claimHolderAgentId: string;
  claimHolderOwnerId: string;
  judgedAgentIds: string[];
  judgedOwnerIds: string[];
  createdAt: Date;
};

/**
 * Scan for open delivery rounds this working agent may judge.
 */
export async function findReviewableIssues(
  agent: AgentContext,
  projectId: string,
  reviewType: "test" = "test",
  track: WorkTrack = "product",
): Promise<ReviewableIssue[]> {
  requireLevel(agent, "working");

  const results: ReviewableIssue[] = [];

  // Delivered work to judge (#delivered-step). Issues to confirm come from
  // openIssueConfirmations() in the work feed (#714).
  if (reviewType === "test") {
    const testCandidates = await prisma.bug.findMany({
      where: {
        tenantId: agent.tenantId,
        projectId,
        ...trackFilter(track),
        isDeleted: false,
        substatus: "requires_review",
        ...(track === "marketing" ? {} : { pullRequestUrl: { not: null } }),
        deliveries: { some: { judgingState: "open" } },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        number: true,
        title: true,
        projectId: true,
        createdAt: true,
        deliveries: {
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            judgingState: true,
            judgingRound: true,
            pullRequestUrl: true,
            agentId: true,
            agent: { select: { ownerUserId: true } },
            judgingVerdicts: { select: { agentId: true, ownerId: true, deliveryRound: true } },
          },
        },
        claims: {
          where: { status: "active", releasedAt: null },
          take: 1,
          select: { agentId: true, beneficiaryUserId: true, agent: { select: { ownerUserId: true } } },
        },
      },
    });

    for (const bug of testCandidates) {
      const delivery = bug.deliveries[0];
      if (!delivery || delivery.judgingState !== "open") continue;
      const claim = bug.claims[0];
      const holderAgentId = claim?.agentId ?? delivery.agentId;
      const holderOwnerId = claim?.agent.ownerUserId ?? delivery.agent.ownerUserId;
      if (agent.agentId === holderAgentId || agent.ownerId === holderOwnerId) continue;
      if (delivery.judgingVerdicts.some((verdict) =>
        verdict.deliveryRound === delivery.judgingRound &&
        (verdict.agentId === agent.agentId || verdict.ownerId === agent.ownerId),
      )) continue;

      results.push({
        id: bug.id,
        number: bug.number,
        title: bug.title,
        projectId: bug.projectId,
        stage: "ready",
        reviewType: "test",
        pullRequestUrl: delivery.pullRequestUrl,
        claimHolderAgentId: holderAgentId,
        claimHolderOwnerId: holderOwnerId,
        judgedAgentIds: delivery.judgingVerdicts
          .filter((verdict) => verdict.deliveryRound === delivery.judgingRound)
          .map((verdict) => verdict.agentId),
        judgedOwnerIds: delivery.judgingVerdicts
          .filter((verdict) => verdict.deliveryRound === delivery.judgingRound)
          .map((verdict) => verdict.ownerId),
        createdAt: bug.createdAt,
      });
    }
  }

  return results;
}
