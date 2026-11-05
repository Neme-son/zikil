"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { correct } from "@/lib/points/correct";
import { clearLeaderboardCache } from "@/lib/points/leaderboard";
import { agentPointsToReverse } from "@/lib/points/reset-agent-points";

const BATCH = 200;

/**
 * Super admin: reverse every point an agent earned in one organization.
 *
 * Nothing is deleted. Each entry gets a correcting entry through the ledger's
 * usual `correct()` (sourceKey `undo:{id}`), so balances drop to zero for that
 * agent work, the history stays, and running it twice changes nothing.
 */
export async function resetAgentPointsAction(formData: FormData) {
  await requireSuperAdmin();
  const slug = String(formData.get("slug") ?? "");
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!tenant) redirect("/superadmin/users");

  let reversed = 0;
  for (;;) {
    const batch = await prisma.pointEntry.findMany({
      where: agentPointsToReverse(tenant.id),
      take: BATCH,
      select: { id: true, tenantId: true, userId: true, bugId: true, role: true, points: true, agentId: true },
    });
    if (batch.length === 0) break;
    await prisma.$transaction(
      async (tx) => {
        for (const entry of batch) await correct(tx, { entry });
      },
      { timeout: 60_000 },
    );
    reversed += batch.length;
  }

  clearLeaderboardCache(tenant.id);
  revalidatePath(`/superadmin/orgs/${tenant.slug}`);
  redirect(`/superadmin/orgs/${tenant.slug}?reversed=${reversed}`);
}
