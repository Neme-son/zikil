"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { changeUserRole } from "@/lib/role-changes";

const SITE_ROLES = ["user", "admin", "super_admin"] as const satisfies readonly Role[];

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (SITE_ROLES as readonly string[]).includes(value);
}

export type SiteRoleActionResult = { ok: true } | { ok: false; error: string };

/** Super admin sets another account's site-wide role (user / admin / super_admin). */
export async function setSiteRoleAction(
  targetUserId: string,
  nextRole: Role,
): Promise<SiteRoleActionResult> {
  const actor = await requireSuperAdmin();
  if (!isRole(nextRole)) {
    return { ok: false, error: "Unknown role." };
  }
  const result = await changeUserRole(prisma, { id: actor.id, role: actor.role }, {
    targetUserId,
    nextRole,
  });
  if (!result.ok) return result;
  revalidatePath("/superadmin/users");
  revalidatePath(`/users/${targetUserId}`);
  return { ok: true };
}
