import type { SecurityCheckStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Paying for a security check (#security-checks, part 1). Payment is simulated
 * for now: paying only sets `SecurityCheck.paidAt`. That one field unlocks the
 * full report (part 4) and releases agent pay (part 3); nothing else happens
 * here. The coin team replaces the inside of `payForCheck` later.
 */

export type PayOutcome = "paid" | "already_paid" | "cancelled" | "not_found";

/** Whether a check can still be paid for. */
export function canPayForCheck(check: { paidAt: Date | null; status: SecurityCheckStatus }): boolean {
  return check.paidAt === null && check.status !== "cancelled";
}

/**
 * Mark the person's own check as paid. Safe to call twice: only the first call
 * sets `paidAt`, so a double click never pays twice. Someone else's check, even
 * in the same workspace, is `not_found`.
 */
export async function payForCheck(checkId: string, organisationId: string, userId: string, now = new Date()): Promise<PayOutcome> {
  const { count } = await prisma.securityCheck.updateMany({
    where: { id: checkId, organisationId, requestedById: userId, paidAt: null, status: { not: "cancelled" } },
    data: { paidAt: now },
  });
  if (count === 1) return "paid";
  const check = await prisma.securityCheck.findFirst({
    where: { id: checkId, organisationId, requestedById: userId },
    select: { paidAt: true, status: true },
  });
  if (!check) return "not_found";
  return check.paidAt ? "already_paid" : "cancelled";
}
