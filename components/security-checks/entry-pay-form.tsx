"use client";

import Link from "next/link";
import { useActionState } from "react";
import { paySecurityCheck } from "@/app/actions/security-checks";

/** "Pay 50 coins" or "Skip for now" (#security-checks, part 1). Paying is simulated: no coins move yet. */
export function PayCheckForm({ checkId, priceCoins, skipHref }: { checkId: string; priceCoins: number; skipHref: string }) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(() => paySecurityCheck(checkId), {});
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-electric-blue-strong px-6 text-[15px] font-bold text-white transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {pending ? "Paying…" : `Pay ${priceCoins} coins`}
      </button>
      {state.error ? <p role="alert" className="m-0 text-sm text-zk-bad-fg">{state.error}</p> : null}
      <Link href={skipHref} className="mx-auto text-sm text-zk-text2 underline-offset-4 hover:text-zk-text hover:underline">
        Not now
      </Link>
    </form>
  );
}
