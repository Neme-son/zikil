"use client";

import { useState } from "react";

/**
 * "Instructions for Agent" (#agent-instructions): copies a brief for this
 * issue's current step, to paste into an agent so it can act on it.
 */
export function CopyAgentInstructions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy instructions an agent can follow for this step"
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zk-border bg-zk-surface px-2.5 text-[13px] font-semibold text-zk-text hover:bg-zk-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-blue"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
      <span aria-live="polite">{copied ? "Copied" : "Instructions for Agent"}</span>
    </button>
  );
}
