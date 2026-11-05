import type { Prisma } from "@prisma/client";

/**
 * The ledger entries a super admin's "reset agent points" reverses in one
 * organization: entries earned by an agent's work that are not already
 * corrected and are not themselves corrections (`undo:` entries).
 */
export function agentPointsToReverse(tenantId: string): Prisma.PointEntryWhereInput {
  return {
    tenantId,
    agentId: { not: null },
    correctedAt: null,
    NOT: { sourceKey: { startsWith: "undo:" } },
  };
}
