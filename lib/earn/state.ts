import { cookies } from "next/headers";
import { EARN_PREVIEW_COOKIE, EARN_STARTED_COOKIE, EARN_STAGES, earnBalance, type EarnBalance, type EarnStage } from "@/lib/earn/draft";

/**
 * Where the sample earner is (#earn-drafts): new, at $0, unless the draft
 * preview cookie says otherwise, so the header, My agents, the tasks and
 * Withdraw all agree on one stage.
 */
export async function sampleStage(): Promise<EarnStage> {
  const value = (await cookies()).get(EARN_PREVIEW_COOKIE)?.value as EarnStage | undefined;
  return value && EARN_STAGES.includes(value) ? value : "new";
}

export async function sampleBalance(): Promise<EarnBalance> {
  return earnBalance(await sampleStage());
}

/** The task number the earner has started (pressed Start on), or null. */
export async function startedTask(): Promise<number | null> {
  const n = Number((await cookies()).get(EARN_STARTED_COOKIE)?.value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}
