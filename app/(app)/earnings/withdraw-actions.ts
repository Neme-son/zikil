"use server";

import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { beingChecked, totalEarned } from "@/lib/earnings";

export type WithdrawDetails = { available: number; checking: number; wallet: string | null };

/** What the Withdraw window shows (#earnings), read when it opens so ordinary pages don't pay for it. Your own only. */
export async function withdrawDetailsAction(): Promise<WithdrawDetails> {
  const user = await requireUser();
  const [total, checking, row] = await Promise.all([
    totalEarned(prisma, user.id),
    beingChecked(prisma, user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { walletAddress: true } }),
  ]);
  return { available: Math.max(0, total), checking, wallet: row?.walletAddress ?? null };
}
