"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-helpers";
import { currentOrganisationAccess } from "@/lib/organisation-access";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { parseSecurityTarget, PRIVATE_TARGET_ERROR } from "@/lib/security-checks/target";
import { addTargetAndCheck, nextStepPath, refusedMessage } from "@/lib/security-checks/entry";
import {
  ASSISTANT_HISTORY_MAX,
  ASSISTANT_MESSAGE_MAX,
  askSecurityAssistant,
  type AssistantTurn,
} from "@/lib/security-checks/assistant";

/**
 * Ziki's security chat, signed in (#security-checks, plan part C3). A plain
 * link is added straight away without asking the AI, so it costs nothing and
 * is instant. Anything else goes to the assistant, which answers and picks
 * out the site. Once a site is clear it is added (a target and a free check)
 * and the client goes on to "Show it's yours". The chat itself creates
 * nothing else.
 */

export type ChatAnswer =
  | { kind: "reply"; reply: string }
  | { kind: "go"; reply: string; href: string }
  | { kind: "error"; error: string };

/** Messages one person may send the assistant in an hour. */
const ASSISTANT_RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };

const NO_WORKSPACE = "Join or create a workspace to secure your assets.";
const ASK_FOR_ADDRESS = "Paste your website, a server address or a GitHub repo, and I'll set up a scan.";

export async function talkToSecurityAssistant(history: AssistantTurn[]): Promise<ChatAnswer> {
  const user = await requireUser();
  const access = await currentOrganisationAccess(user.id, user.role);
  if (!access.organisationId) return { kind: "error", error: NO_WORKSPACE };

  const turns = cleanHistory(history);
  const last = turns.at(-1);
  if (!last || last.role !== "user") return { kind: "error", error: "Type what you want to secure." };

  // A plain link needs no AI.
  const direct = parseSecurityTarget(last.text);
  if (direct.ok) return addAndGo(access.organisationId, user.id, direct.target, "Got it. Next, show it's yours and the scan starts.");
  if (direct.error === PRIVATE_TARGET_ERROR) return { kind: "reply", reply: PRIVATE_TARGET_ERROR };

  const limit = checkRateLimit(`security-assistant:${user.id}`, ASSISTANT_RATE_LIMIT);
  if (!limit.allowed) return { kind: "error", error: RATE_LIMIT_MESSAGE };

  const answer = await askSecurityAssistant(turns);
  if (!answer) return { kind: "reply", reply: ASK_FOR_ADDRESS };
  if (answer.target) {
    const picked = parseSecurityTarget(answer.target);
    if (picked.ok) return addAndGo(access.organisationId, user.id, picked.target, answer.reply);
    if (picked.error === PRIVATE_TARGET_ERROR) return { kind: "reply", reply: PRIVATE_TARGET_ERROR };
  }
  return { kind: "reply", reply: answer.reply };
}

async function addAndGo(
  organisationId: string,
  userId: string,
  target: Parameters<typeof addTargetAndCheck>[2],
  reply: string,
): Promise<ChatAnswer> {
  const added = await addTargetAndCheck(organisationId, userId, target);
  if ("refused" in added) return { kind: "reply", reply: refusedMessage(added.refused, target.value) };
  revalidatePath("/security");
  // Not proven yet: on to "Show it's yours". Proven already: back to Assets, where the free scan starts.
  return { kind: "go", reply, href: nextStepPath(added) };
}

/** Only well-formed turns, trimmed to the limits, at most the last few. */
function cleanHistory(history: unknown): AssistantTurn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((turn): turn is AssistantTurn =>
      typeof turn === "object" && turn !== null &&
      ((turn as AssistantTurn).role === "user" || (turn as AssistantTurn).role === "assistant") &&
      typeof (turn as AssistantTurn).text === "string",
    )
    .map((turn) => ({ role: turn.role, text: turn.text.trim().slice(0, ASSISTANT_MESSAGE_MAX) }))
    .filter((turn) => turn.text)
    .slice(-ASSISTANT_HISTORY_MAX);
}
