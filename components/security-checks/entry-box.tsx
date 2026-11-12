"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { SecurityTargetKind } from "@prisma/client";
import { addSecurityTarget, type AddTargetState } from "@/app/actions/security-checks";
import { TARGET_KIND_LABEL } from "@/lib/security-checks";
import { parseSecurityTarget, PRIVATE_TARGET_ERROR, TARGET_INPUT_MAX } from "@/lib/security-checks/target";

/** What agents will look at, said back to the client once Ziki knows what they pasted. */
const WILL_CHECK: Record<SecurityTargetKind, (value: string) => React.ReactNode> = {
  website: (value) => <>We&apos;ll check <strong className="text-zk-text">{value}</strong> and every page it links to.</>,
  server: (value) => <>We&apos;ll check what&apos;s open to the internet on <strong className="text-zk-text">{value}</strong>.</>,
  repo: (value) => <>We&apos;ll read the code in <strong className="text-zk-text">{value}</strong>.</>,
};

const EXAMPLES: { label: string; kind: SecurityTargetKind; value: string }[] = [
  { label: "Website", kind: "website", value: "yourshop.com" },
  { label: "Server", kind: "server", value: "ssh://yourserver.com" },
  { label: "Code", kind: "repo", value: "github.com/you/app" },
];

/**
 * The one box (#security-checks, part 1): paste a website, server address or
 * GitHub repo. Ziki says which it is as you type, so nobody picks from options.
 */
export function SecurityEntryBox({ focusOnOpen = false, id = "security-target" }: { focusOnOpen?: boolean; id?: string }) {
  const [state, action, pending] = useActionState<AddTargetState, FormData>(addSecurityTarget, {});
  const [value, setValue] = useState(state.input ?? "");
  const parsed = value.trim() ? parseSecurityTarget(value) : null;
  const target = parsed?.ok ? parsed.target : null;
  const isPrivate = parsed !== null && !parsed.ok && parsed.error === PRIVATE_TARGET_ERROR;
  const errorId = `${id}-error`;
  const input = useRef<HTMLInputElement>(null);
  // On its own page the box was opened on purpose, so typing can start at once.
  useEffect(() => {
    if (focusOnOpen) input.current?.focus();
  }, [focusOnOpen]);

  return (
    <form action={action} className="space-y-3" noValidate>
      <label htmlFor={id} className="sr-only">Website, server address or GitHub repo</label>
      <div className="flex items-center gap-3 rounded-2xl border-2 border-zk-border bg-zk-surface py-2 pl-4 pr-2 transition focus-within:border-electric-blue-strong focus-within:ring-4 focus-within:ring-electric-blue-strong/15">
        <KindIcon kind={target?.kind ?? null} />
        <input
          id={id}
          name="target"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="ziki.dev"
          maxLength={TARGET_INPUT_MAX}
          ref={input}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="url"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : `${id}-reading`}
          className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base sm:text-lg text-zk-text outline-none placeholder:text-zk-muted"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-electric-blue-strong px-4 text-sm sm:h-12 sm:px-6 sm:text-base font-bold text-white transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Check it"}
          {pending ? null : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          )}
        </button>
      </div>

      <div className="min-h-7">
        {state.error ? (
          <p id={errorId} role="alert" className="m-0 text-sm font-medium text-zk-bad-fg">{state.error}</p>
        ) : null}
        <p id={`${id}-reading`} aria-live="polite" className={`m-0 flex-wrap items-center gap-2 text-sm text-zk-text2 ${state.error || !parsed ? "hidden" : "flex"}`}>
          {target ? (
            <>
              <Chip tone="ok">{TARGET_KIND_LABEL[target.kind]}</Chip>
              <span>{WILL_CHECK[target.kind](target.value)}</span>
            </>
          ) : isPrivate ? (
            <>
              <Chip tone="bad">Private address</Chip>
              <span>{PRIVATE_TARGET_ERROR}</span>
            </>
          ) : parsed ? (
            <span className="text-zk-muted">Keep typing: a website, server address or GitHub repo.</span>
          ) : null}
        </p>
        {!parsed && !state.error ? (
          <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-zk-muted">
            <span className="mr-1">Try</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                aria-label={`Use the ${example.label.toLowerCase()} example, ${example.value}`}
                onClick={() => {
                  setValue(example.value);
                  input.current?.focus();
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-zk-border bg-zk-surface px-3 py-1 text-[13px] text-zk-text2 transition hover:border-zk-accent hover:text-zk-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue"
              >
                <KindIcon kind={example.kind} className="h-3.5 w-3.5" />
                <span className="font-mono">{example.value}</span>
              </button>
            ))}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Chip({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-bold ${tone === "ok" ? "bg-zk-ok-bg text-zk-ok-fg" : "bg-zk-bad-bg text-zk-bad-fg"}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** A globe, server or code icon for what was pasted. */
export function KindIcon({ kind, className = "text-zk-muted" }: { kind: SecurityTargetKind | null; className?: string }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: `shrink-0 ${className}` };
  if (kind === "server") {
    return (
      <svg {...common}><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>
    );
  }
  if (kind === "repo") {
    return <svg {...common}><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></svg>;
  }
  return (
    <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>
  );
}
