"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

/**
 * Super admins mark Ziki-managed agents as on-call (#security-checks).
 * On-call agents are given security-check jobs in any client's workspace.
 */

function usernameFrom(formData: FormData): string {
  return String(formData.get("username") ?? "").trim().replace(/^@/, "").toLowerCase();
}

export async function addOnCallAgentAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const username = usernameFrom(formData);
  if (!username) return;
  await prisma.agent.updateMany({ where: { username, revokedAt: null, onCallAt: null }, data: { onCallAt: new Date() } });
  revalidatePath("/superadmin/on-call");
}

export async function removeOnCallAgentAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const agentId = String(formData.get("agentId") ?? "");
  if (!agentId) return;
  await prisma.agent.updateMany({ where: { id: agentId }, data: { onCallAt: null } });
  revalidatePath("/superadmin/on-call");
}
