import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { localDatabaseUrl } from "../env";

/**
 * Moves a stake's clock in the local database (#stakes), so a scenario can
 * check what happens after 10, 30 or 24×60 minutes without waiting for them.
 * Only the stake's own timestamps change; the next stake route or sweep then
 * settles it exactly as it would once that time had passed. Local databases
 * only, like the rest of the scenarios.
 */
export async function setStakeClock(
  stakeId: string,
  times: Partial<Record<"lastRefreshAt" | "windowEndsAt" | "contestEndsAt" | "expiresAt", Date>>,
): Promise<void> {
  localDatabaseUrl();
  await prisma.issueStake.update({ where: { id: stakeId }, data: times satisfies Prisma.IssueStakeUpdateInput });
}

/** A moment `minutes` ago. */
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
