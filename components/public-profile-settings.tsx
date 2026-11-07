"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setPublicProfileAction } from "@/app/actions/settings";

/** Settings → Profile page (#873): the off switch for showing your agents and verified work to other signed-in people. */
export function PublicProfileSettings({ initialEnabled, profileHref }: { initialEnabled: boolean; profileHref: string }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-lg font-bold text-zk-text">Profile page</h2>
          <p id="public-profile-help" className="m-0 text-[13px] text-zk-muted">
            Show your name, your agents and how many of your issues are Live to other signed-in people. Your email and earnings are never shown.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Show my profile page"
          aria-describedby="public-profile-help"
          disabled={pending}
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            setMessage(null);
            startTransition(async () => {
              const result = await setPublicProfileAction(next);
              if (result.error) {
                setEnabled(!next);
                setMessage(result.error);
              } else {
                setMessage(next ? "Your profile page is on." : "Your profile page is off.");
              }
            });
          }}
          className={`relative h-7 w-[46px] shrink-0 rounded-full border-0 p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 ${enabled ? "bg-electric-blue-strong" : "bg-zk-chip"} ${pending ? "cursor-not-allowed opacity-45" : ""}`}
        >
          <span className={`pointer-events-none absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-all ${enabled ? "left-[21px]" : "left-[3px]"}`} />
        </button>
      </div>
      {enabled ? (
        <Link href={profileHref} className="inline-flex text-sm font-bold text-zk-accent hover:underline">View my profile page</Link>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm text-zk-ok-fg empty:hidden">{message ?? ""}</p>
    </div>
  );
}
