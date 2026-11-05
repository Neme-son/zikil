import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/agents/audit";
import { isTenantAdmin } from "@/lib/agents/membership";
import type { Actor } from "@/lib/agents/registry";
import { resumeAfterWait } from "@/lib/claim-deadline";

/**
 * Pause and resume an agent (#236). Its owner, or an admin of its workspace,
 * can stop an agent mid-work without revoking it:
 *
 * - While paused the agent may read (GET) but every write is refused with
 *   403 `agent_paused` (see lib/agents/work-gate.ts), so it can't bid, take an
 *   offer, deliver, comment or file anything.
 * - The issues it holds stay its own. Their silence and deadline clocks stand
 *   still (`IssueClaim.pausedSince`), so the stale-claim sweep leaves them
 *   alone until the pause has lasted PAUSE_CAP_HOURS.
 * - Resuming adds the paused time back to each claim's deadline and silence
 *   clock, so the pause costs the agent nothing.
 *
 * "Pause all" does the same for every live agent the person owns in the
 * workspace, in one go.
 */

/** How long a paused claim keeps its issue before the sweep hands it back for bids. */
export const PAUSE_CAP_HOURS = 24;

export type PauseResult = { ok: true; changed: boolean } | { ok: false; error: string };
export type PauseAllResult = { ok: true; changed: number } | { ok: false; error: string };

const NOT_FOUND = "That agent doesn't exist, or it isn't yours to change.";

type Tx = Prisma.TransactionClient;

async function managed(actor: Actor, agentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, tenantId: true, ownerUserId: true, revokedAt: true, pausedAt: true },
  });
  if (!agent) return null;
  const isOwner = agent.ownerUserId === actor.id;
  if (!isOwner && !(await isTenantAdmin(actor, agent.tenantId))) return null;
  return { agent, isOwner };
}

/** Freeze the clocks on every issue the agent is working on. */
async function freezeClaims(tx: Tx, agentId: string, now: Date): Promise<number> {
  const { count } = await tx.issueClaim.updateMany({
    where: { agentId, status: "active", releasedAt: null, pausedSince: null },
    data: { pausedSince: now },
  });
  return count;
}

/** Start the clocks again, with the paused time added back. */
async function thawClaims(tx: Tx, agentId: string, now: Date): Promise<number> {
  const claims = await tx.issueClaim.findMany({
    where: { agentId, releasedAt: null, pausedSince: { not: null } },
    select: { id: true, pausedSince: true, deliverBy: true, lastHeartbeatAt: true, claimedAt: true },
  });
  for (const claim of claims) {
    const since = claim.pausedSince!;
    const lastSeen = resumeAfterWait(claim.lastHeartbeatAt ?? claim.claimedAt, since, now);
    await tx.issueClaim.update({
      where: { id: claim.id },
      data: {
        pausedSince: null,
        deliverBy: resumeAfterWait(claim.deliverBy, since, now),
        // Never later than now, so a resumed agent isn't counted as seen in the future.
        lastHeartbeatAt: lastSeen && lastSeen.getTime() > now.getTime() ? now : lastSeen,
      },
    });
  }
  return claims.length;
}

async function pauseOne(tx: Tx, agent: { id: string; tenantId: string }, actor: Actor, by: string, now: Date) {
  const { count } = await tx.agent.updateMany({
    where: { id: agent.id, pausedAt: null, revokedAt: null },
    data: { pausedAt: now },
  });
  if (!count) return false;
  const claimsPaused = await freezeClaims(tx, agent.id, now);
  await audit({ agentId: agent.id, tenantId: agent.tenantId }, "agent.paused", `agent:${agent.id}`,
    { by, claimsPaused }, { actorUserId: actor.id, db: tx });
  return true;
}

async function resumeOne(tx: Tx, agent: { id: string; tenantId: string }, actor: Actor, by: string, now: Date) {
  const row = await tx.agent.findUnique({ where: { id: agent.id }, select: { pausedAt: true } });
  if (!row?.pausedAt) return false;
  await tx.agent.update({ where: { id: agent.id }, data: { pausedAt: null } });
  const claimsResumed = await thawClaims(tx, agent.id, now);
  await audit({ agentId: agent.id, tenantId: agent.tenantId }, "agent.resumed", `agent:${agent.id}`,
    { by, claimsResumed, pausedMinutes: Math.round((now.getTime() - row.pausedAt.getTime()) / 60_000) },
    { actorUserId: actor.id, db: tx });
  return true;
}

/** Pauses one agent. Pausing a paused agent is harmless. */
export async function pauseAgent(actor: Actor, agentId: string, now = new Date()): Promise<PauseResult> {
  const found = await managed(actor, agentId);
  if (!found) return { ok: false, error: NOT_FOUND };
  if (found.agent.revokedAt) return { ok: false, error: "A revoked agent can't be paused." };
  if (found.agent.pausedAt) return { ok: true, changed: false };
  const by = found.isOwner ? "owner" : "tenant_admin";
  const changed = await prisma.$transaction((tx) => pauseOne(tx, found.agent, actor, by, now));
  return { ok: true, changed };
}

/** Resumes one agent. Resuming an agent that isn't paused is harmless. */
export async function resumeAgent(actor: Actor, agentId: string, now = new Date()): Promise<PauseResult> {
  const found = await managed(actor, agentId);
  if (!found) return { ok: false, error: NOT_FOUND };
  if (!found.agent.pausedAt) return { ok: true, changed: false };
  const by = found.isOwner ? "owner" : "tenant_admin";
  const changed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Agent" WHERE "id" = ${agentId} FOR UPDATE`;
    return resumeOne(tx, found.agent, actor, by, now);
  });
  return { ok: true, changed };
}

/** Pauses every live agent the person owns in this workspace. */
export async function pauseAllAgents(actor: Actor, tenantId: string, now = new Date()): Promise<PauseAllResult> {
  const agents = await prisma.agent.findMany({
    where: { ownerUserId: actor.id, tenantId, revokedAt: null, pausedAt: null },
    select: { id: true, tenantId: true },
  });
  const changed = await prisma.$transaction(async (tx) => {
    let n = 0;
    for (const agent of agents) if (await pauseOne(tx, agent, actor, "owner_all", now)) n++;
    return n;
  });
  return { ok: true, changed };
}

/** Resumes every paused agent the person owns in this workspace. */
export async function resumeAllAgents(actor: Actor, tenantId: string, now = new Date()): Promise<PauseAllResult> {
  const agents = await prisma.agent.findMany({
    where: { ownerUserId: actor.id, tenantId, pausedAt: { not: null } },
    select: { id: true, tenantId: true },
  });
  const changed = await prisma.$transaction(async (tx) => {
    let n = 0;
    for (const agent of agents) if (await resumeOne(tx, agent, actor, "owner_all", now)) n++;
    return n;
  });
  return { ok: true, changed };
}

/** Whether a claim's pause has gone on long enough that the sweep hands its issue back. */
export function isPauseOver(pausedSince: Date, now: Date): boolean {
  return now.getTime() - pausedSince.getTime() >= PAUSE_CAP_HOURS * 60 * 60_000;
}
