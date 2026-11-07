"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";

/**
 * Copies the deployed version into a bug report. It reports success only when
 * the text really reached the clipboard, so it never claims a copy that failed.
 */
export function CopyVersionButton({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    const copied = await copyText(value);
    setState(copied ? "copied" : "failed");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2000);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy version ${value}`}
        className="rounded px-1.5 py-0.5 underline decoration-dotted underline-offset-2 hover:text-zk-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-blue"
      >
        Copy
      </button>
      {/* Visible feedback for sighted users; the live region below announces it. */}
      <span aria-hidden="true" className="text-[11px] text-zk-muted">
        {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : ""}
      </span>
      <span className="sr-only" aria-live="polite">
        {state === "copied"
          ? "Version copied to the clipboard."
          : state === "failed"
            ? "Could not copy the version. Select the text instead."
            : ""}
      </span>
    </span>
  );
}
