"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { currentOrganisationAccess } from "@/lib/organisation-access";
import { parseSecurityTarget } from "@/lib/security-checks/target";
import { addTargetAndCheck, nextStepPath } from "@/lib/security-checks/entry";
import { payForCheck } from "@/lib/security-checks/payment";

/**
 * Server actions for the Security box and the pay-or-skip screen
 * (#security-checks, part 1). The database is the handover to the other parts:
 * a new check waits in `awaiting_ownership` for part 2, and `paidAt` is all
 * that paying sets.
 */

export type AddTargetState = { error?: string; input?: string };

const NO_WORKSPACE = "Join or create a workspace to check a site.";

/**
 * Step 1: read the box, store the target and open a check. A target already
 * proven goes on to paying. Otherwise the client goes back to Security, where
 * the new check is highlighted and Continue leads to step 2 (part 2's page).
 */
export async function addSecurityTarget(_previous: AddTargetState, form: FormData): Promise<AddTargetState> {
  const user = await requireUser();
  const access = await currentOrganisationAccess(user.id, user.role);
  const raw = form.get("target");
  const input = typeof raw === "string" ? raw : "";
  if (!access.organisationId) return { error: NO_WORKSPACE, input };

  const parsed = parseSecurityTarget(input);
  if (!parsed.ok) return { error: parsed.error, input };

  const added = await addTargetAndCheck(access.organisationId, user.id, parsed.target);
  revalidatePath("/security");
  redirect(added.verified ? nextStepPath(added) : `/security?check=${encodeURIComponent(added.checkId)}&added=1`);
}

/** Step 3: "Pay 50 coins". Simulated: it only marks the check paid. */
export async function paySecurityCheck(checkId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const access = await currentOrganisationAccess(user.id, user.role);
  if (!access.organisationId) return { error: NO_WORKSPACE };

  const outcome = await payForCheck(checkId, access.organisationId, user.id);
  if (outcome === "not_found") return { error: "That check isn't in this workspace." };
  if (outcome === "cancelled") return { error: "That check was cancelled, so there's nothing to pay." };
  revalidatePath("/security");
  redirect(`/security?check=${encodeURIComponent(checkId)}&paid=1`);
}
