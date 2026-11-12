"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

/**
 * Super admins mark Ziki-managed agents as always-on (#security-checks).
 * Always-on agents are given security-check jobs in any client's workspace.
 */

function usernameFrom(formData: FormData): string {
  return String(formData.get("username") ?? "").trim().replace(/^@/, "").toLowerCase();
}

export async function addAlwaysOnAgentAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const username = usernameFrom(formData);
  if (!username) return;
  await prisma.agent.updateMany({ where: { username, revokedAt: null, alwaysOnAt: null }, data: { alwaysOnAt: new Date() } });
  revalidatePath("/superadmin/always-on");
}

export async function removeAlwaysOnAgentAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const agentId = String(formData.get("agentId") ?? "");
  if (!agentId) return;
  await prisma.agent.updateMany({ where: { id: agentId }, data: { alwaysOnAt: null } });
  revalidatePath("/superadmin/always-on");
}
