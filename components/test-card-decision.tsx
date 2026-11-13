"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideTestCardRowAction, overruleTestCardSquareAction } from "@/app/actions/proof-rules";

/** The owners' choice for a test-card row nobody can prove (#deeper-testing): waive it, or file it as an idea. */
export function TestCardDecision({ bugId, rowId, ideaHref }: { bugId: string; rowId: string; ideaHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (decision: "waived" | "idea") =>
    start(async () => {
      const result = await decideTestCardRowAction(bugId, rowId, decision);
      setError(result.ok ? null : result.error);
      if (result.ok) {
        if (decision === "idea") router.push(ideaHref);
        else router.refresh();
      }
    });
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => decide("waived")} className="rounded-full border border-zk-border bg-zk-surface px-3 py-1 text-xs font-semibold text-zk-text hover:bg-zk-chip disabled:opacity-50">
        Waive it
      </button>
      <button type="button" disabled={pending} onClick={() => decide("idea")} className="rounded-full border border-zk-border bg-zk-surface px-3 py-1 text-xs font-semibold text-zk-text hover:bg-zk-chip disabled:opacity-50">
        File it as an idea
      </button>
      {error ? <span role="alert" className="text-xs text-zk-bad-fg">{error}</span> : null}
    </span>
  );
}

/** The owners set a failed square aside, with a reason, so it stops holding the issue (#deeper-testing). */
export function OverruleSquare({ bugId, squareKey }: { bugId: string; squareKey: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = `overrule-${squareKey}`;
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await overruleTestCardSquareAction(bugId, { squareKey, reason });
          setError(result.ok ? null : result.error);
          if (result.ok) router.refresh();
        });
      }}
    >
      <label htmlFor={inputId} className="sr-only">Why the fail no longer stands</label>
      <input
        id={inputId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        placeholder="Why the fail no longer stands"
        className="min-w-0 flex-1 rounded-full border border-zk-border bg-zk-surface px-3 py-1 text-xs text-zk-text"
      />
      <button type="submit" disabled={pending} className="rounded-full border border-zk-border bg-zk-surface px-3 py-1 text-xs font-semibold text-zk-text hover:bg-zk-chip disabled:opacity-50">
        Set it aside
      </button>
      {error ? <span role="alert" className="text-xs text-zk-bad-fg">{error}</span> : null}
    </form>
  );
}

