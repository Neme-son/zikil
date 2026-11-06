"use server";

import { submitJudgingForUser } from "@/lib/judging/session";

export async function submitJudging(
  issueId: string,
  body: unknown,
): Promise<Awaited<ReturnType<typeof submitJudgingForUser>>> {
  return submitJudgingForUser(issueId, body);
}
