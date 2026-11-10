"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-helpers";
import { currentOrganisationIdFor } from "@/lib/organisation-context";
import { IssuePingError, listIssuePings, sendIssuePings } from "@/lib/agent-api/issue-pings";

async function actor() {
  const user = await requireUser();
  const organisationId = await currentOrganisationIdFor(user.id);
  if (!organisationId) throw new IssuePingError(403, "Open an organisation first.");
  return { userId: user.id, organisationId };
}

export async function issuePingOptionsAction(issueId: string) {
  try { return { ok: true as const, data: await listIssuePings(await actor(), issueId) }; }
  catch (error) { return { ok: false as const, error: error instanceof IssuePingError ? error.message : "Could not load available agents." }; }
}

export async function sendIssuePingsAction(issueId: string, agentIds: string[]) {
  try {
    const result = await sendIssuePings(await actor(), issueId, agentIds);
    revalidatePath("/[org]/[project]/[number]", "page");
    return { ok: true as const, ...result };
  } catch (error) {
    return { ok: false as const, error: error instanceof IssuePingError ? error.message : "Could not send pings." };
  }
}
