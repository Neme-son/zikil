import { randomBytes } from "node:crypto";
import { Prisma, type SecurityCheckStatus, type SecurityTargetKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SECURITY_CHECK_PRICE_COINS, FINISHED_CHECK_STATUSES } from "@/lib/security-checks";
import type { ParsedTarget } from "@/lib/security-checks/target";

/**
 * Adding something to check (#security-checks, part 1): store the target once
 * per workspace and open a check for it. Ownership (part 2), agents (part 3)
 * and the report (part 4) take it from there through the database.
 */

export type AddedCheck = {
  targetId: string;
  checkId: string;
  /** Ownership was already proven for this target, so the client goes straight to paying. */
  verified: boolean;
  /** An unfinished check for this target already existed and was reused. */
  reused: boolean;
};

/** A fresh secret for the DNS TXT record or homepage tag. */
export function newOwnershipToken(): string {
  return `ziki-verify-${randomBytes(16).toString("hex")}`;
}

/**
 * Store the target (or reuse the workspace's existing one) and open a check.
 * The person's own unfinished check on that target is reused rather than
 * opening a second one, so pasting the same site twice doesn't charge twice.
 * Checks are per person: someone else in the workspace gets their own.
 */
export async function addTargetAndCheck(
  organisationId: string,
  userId: string,
  target: ParsedTarget,
): Promise<AddedCheck> {
  const stored = await findOrCreateTarget(organisationId, userId, target);
  const verified = stored.verifiedAt !== null;

  const open = await prisma.securityCheck.findFirst({
    where: { targetId: stored.id, organisationId, requestedById: userId, status: { notIn: [...FINISHED_CHECK_STATUSES] } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (open) return { targetId: stored.id, checkId: open.id, verified, reused: true };

  const check = await prisma.securityCheck.create({
    data: {
      organisationId,
      targetId: stored.id,
      requestedById: userId,
      priceCoins: SECURITY_CHECK_PRICE_COINS,
      // A target proven once never asks again: its new checks are ready for agents.
      status: verified ? "queued" : "awaiting_ownership",
    },
    select: { id: true },
  });
  return { targetId: stored.id, checkId: check.id, verified, reused: false };
}

async function findOrCreateTarget(organisationId: string, userId: string, target: ParsedTarget) {
  const where = { organisationId_kind_value: { organisationId, kind: target.kind, value: target.value } };
  const select = { id: true, verifiedAt: true } as const;
  const existing = await prisma.securityTarget.findUnique({ where, select });
  if (existing) return existing;
  try {
    return await prisma.securityTarget.create({
      data: {
        organisationId,
        kind: target.kind,
        value: target.value,
        input: target.input,
        addedById: userId,
        ownershipToken: newOwnershipToken(),
      },
      select,
    });
  } catch (error) {
    // Two people added the same target at once: use the one that won.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.securityTarget.findUnique({ where, select });
      if (winner) return winner;
    }
    throw error;
  }
}

/** Where the client goes next for a check: prove ownership, or pay or skip. */
export function nextStepPath(check: { targetId: string; checkId: string; verified: boolean }): string {
  return check.verified ? `/security/checks/${check.checkId}/pay` : `/security/targets/${check.targetId}/verify`;
}

export type WorkspaceCheckRow = {
  id: string;
  targetId: string;
  kind: SecurityTargetKind;
  value: string;
  status: SecurityCheckStatus;
  verified: boolean;
  paid: boolean;
  priceCoins: number;
  createdAt: Date;
};

/** The workspace's checks, newest first: the returning user's list on the Security page. */
export async function listWorkspaceChecks(organisationId: string, userId: string, take = 20): Promise<WorkspaceCheckRow[]> {
  const rows = await prisma.securityCheck.findMany({
    // Only the checks this person asked for: others in the workspace don't see them.
    where: { organisationId, requestedById: userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      paidAt: true,
      priceCoins: true,
      createdAt: true,
      target: { select: { id: true, kind: true, value: true, verifiedAt: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    targetId: row.target.id,
    kind: row.target.kind,
    value: row.target.value,
    status: row.status,
    verified: row.target.verifiedAt !== null,
    paid: row.paidAt !== null,
    priceCoins: row.priceCoins,
    createdAt: row.createdAt,
  }));
}
