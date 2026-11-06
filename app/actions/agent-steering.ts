"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import type { Prisma } from "@prisma/client";
import { publish } from "@/lib/agent-api/events";

type PauseResult = { ok: true } | { ok: false; error: string };

/**
 * Pause or resume one of the owner's agents inside [tx]. Pausing releases its
 * open offers; resuming moves its active claims' clocks forward by the time it
 * was paused, so the pause costs it nothing.
 */
async function applyAgentPause(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  agentId: string,
  paused: boolean,
): Promise<PauseResult> {
  // Serialize repeated pause/resume requests before reading the clock.
  await tx.$queryRaw`SELECT "id" FROM "Agent" WHERE "id" = ${agentId} AND "ownerUserId" = ${ownerUserId} FOR UPDATE`;
  const agent = await tx.agent.findFirst({
    where: { id: agentId, ownerUserId, revokedAt: null },
    select: { id: true, pausedAt: true },
  });
  if (!agent) return { ok: false as const, error: "Agent not found." };
  if (paused === Boolean(agent.pausedAt)) return { ok: true as const };
  const now = new Date();
  if (paused) {
    await tx.agent.update({ where: { id: agentId }, data: { pausedAt: now } });
    const offers = await tx.issueClaim.findMany({
      where: { agentId, status: "offered", releasedAt: null },
      select: { id: true, bugId: true, beneficiaryUserId: true, bug: { select: { organisationId: true } } },
    });
    await tx.issueClaim.updateMany({
      where: { agentId, status: "offered", releasedAt: null },
      data: { status: "released", releasedAt: now, releaseReason: "paused" },
    });
    for (const offer of offers) {
      await publish(tx, { organisationId: offer.bug.organisationId, type: "claim.released", actorAgentId: agentId, bugId: offer.bugId,
        payload: { claimId: offer.id, issueId: offer.bugId, beneficiaryUserId: offer.beneficiaryUserId, reason: "paused" } });
    }
    return { ok: true as const };
  }

  const pausedAt = agent.pausedAt!;
  const duration = now.getTime() - pausedAt.getTime();
  const claims = await tx.issueClaim.findMany({
    where: { agentId, status: "active", releasedAt: null },
    select: { id: true, claimedAt: true, lastHeartbeatAt: true, deliverBy: true, waitingOnOwnerSince: true },
  });
  for (const claim of claims) {
    await tx.issueClaim.update({
      where: { id: claim.id },
      data: {
        // claimedAt is historical. Use it only as the heartbeat fallback.
        lastHeartbeatAt: (claim.lastHeartbeatAt ?? claim.claimedAt)
          ? new Date((claim.lastHeartbeatAt ?? claim.claimedAt)!.getTime() + duration) : null,
        deliverBy: claim.deliverBy ? new Date(claim.deliverBy.getTime() + duration) : null,
        waitingOnOwnerSince: claim.waitingOnOwnerSince ? new Date(claim.waitingOnOwnerSince.getTime() + duration) : null,
      },
    });
  }
  await tx.agent.update({ where: { id: agentId }, data: { pausedAt: null } });
  return { ok: true as const };
}

function revalidatePausePaths() {
  revalidatePath("/agents/mine");
  revalidatePath("/[org]/[project]/[number]", "page");
}

export async function setAgentPaused(agentId: string, paused: boolean) {
  const user = await requireUser();
  const result = await prisma.$transaction((tx) => applyAgentPause(tx, user.id, agentId, paused));
  if (!result.ok) return result;
  revalidatePausePaths();
  return result;
}

/**
 * Pause all / Resume all (#236): pauses or resumes every agent the signed-in
 * owner has that isn't revoked, in one transaction, so it is all or nothing.
 * Agents already in the asked-for state are left as they are. Returns how
 * many changed.
 */
export async function setAllAgentsPaused(paused: boolean) {
  const user = await requireUser();
  const changed = await prisma.$transaction(async (tx) => {
    const agents = await tx.agent.findMany({
      where: { ownerUserId: user.id, revokedAt: null, pausedAt: paused ? null : { not: null } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const agent of agents) await applyAgentPause(tx, user.id, agent.id, paused);
    return agents.length;
  });
  if (changed > 0) revalidatePausePaths();
  return { ok: true as const, changed };
}

export async function sendIssueSteer(agentId: string, issueId: string, body: string) {
  const user = await requireUser();
  const text = body.trim();
  if (!text || text.length > 2000) return { ok: false as const, error: "Write a steer note (up to 2000 characters)." };
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, ownerUserId: user.id, revokedAt: null, claims: { some: { bugId: issueId, status: "active", releasedAt: null } } },
    select: { id: true },
  });
  if (!agent) return { ok: false as const, error: "Only the owner of the agent working on this issue can steer it." };
  const now = new Date();
  await prisma.agentInboxItem.create({
    data: {
      agentId, kind: "message", eventType: "agent.steer",
      bugId: issueId, createdAt: now,
      payload: { type: "steer", issueId, body: text, fromUserId: user.id, from: user.name ?? "Owner" },
    },
  });
  revalidatePath("/[org]/[project]/[number]", "page");
  return { ok: true as const };
}
