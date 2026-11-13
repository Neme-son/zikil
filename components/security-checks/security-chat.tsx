"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { talkToSecurityAssistant } from "@/app/actions/security-assistant";
import { TARGET_KIND_LABEL } from "@/lib/security-checks";
import { ClaudeWorking } from "@/components/claude-working";
import { parseSecurityTarget, PRIVATE_TARGET_ERROR } from "@/lib/security-checks/target";
import type { AssistantTurn } from "@/lib/security-checks/assistant";

const MESSAGE_MAX = 600;

/** What Ziki is doing while it answers, typed out like the Ideas chat. */
const WORKING_STEPS = [
  "Reading what you wrote…",
  "Working out what you want to secure…",
  "Checking it's a website, server or repo…",
  "Writing back…",
];

/**
 * The box on Security, with Ziki's AI behind it (#security-checks, plan part
 * C3). It looks like the Ideas box. Paste a link and it goes straight on;
 * type anything else ("I want to secure my shop's website") and Ziki answers,
 * asks for what's missing, and once the site is clear leads on to "Show it's
 * yours". It only talks about checking a site with Ziki, and creates nothing
 * else.
 */
export function SecurityChat({ id = "security-chat", focusOnOpen = false }: { id?: string; focusOnOpen?: boolean }) {
  const router = useRouter();
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const value = text.trim();
  const parsed = value ? parseSecurityTarget(value) : null;
  const target = parsed?.ok ? parsed.target : null;
  const isPrivate = parsed !== null && !parsed.ok && parsed.error === PRIVATE_TARGET_ERROR;
  const errorId = `${id}-error`;

  useEffect(() => {
    if (focusOnOpen) box.current?.focus();
  }, [focusOnOpen]);
  // Keep the newest message in view.
  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [turns, pending]);
  // Grow with the text, up to a few lines.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  function send() {
    if (!value || pending) return;
    const next: AssistantTurn[] = [...turns, { role: "user", text: value.slice(0, MESSAGE_MAX) }];
    setTurns(next);
    setText("");
    setError(null);
    startTransition(async () => {
      try {
        const answer = await talkToSecurityAssistant(next);
        if (answer.kind === "error") {
          setError(answer.error);
          return;
        }
        setTurns([...next, { role: "assistant", text: answer.reply }]);
        if (answer.kind === "go") router.push(answer.href);
      } catch {
        setError("Ziki couldn't answer just now. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {turns.length ? (
        <ol ref={log} aria-label="Conversation with Ziki" aria-live="polite" className="m-0 flex max-h-80 list-none flex-col gap-2.5 overflow-y-auto p-0">
          {turns.map((turn, index) => (
            <li key={index} className={turn.role === "user" ? "ml-auto max-w-[85%]" : "mr-auto flex max-w-[90%] items-start gap-2"}>
              {turn.role === "user" ? (
                <p className="m-0 whitespace-pre-wrap break-words rounded-[18px] rounded-br-md bg-electric-blue-strong px-4 py-2 text-[15px] text-white">
                  <span className="sr-only">You: </span>
                  {turn.text}
                </p>
              ) : (
                <>
                  <span aria-hidden="true" className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zk-text text-[11px] font-extrabold text-zk-surface">Z</span>
                  <p className="m-0 whitespace-pre-wrap break-words rounded-[18px] rounded-tl-md border border-zk-border bg-zk-surface px-4 py-2 text-[15px] text-zk-text2">
                    <span className="sr-only">Ziki: </span>
                    {turn.text}
                  </p>
                </>
              )}
            </li>
          ))}
          {pending ? (
            // The same "Claude is working" lines as the Ideas chat, for this job.
            <li className="mr-auto w-full max-w-[90%]">
              <ClaudeWorking steps={WORKING_STEPS} statusText="Ziki is reading your message." />
            </li>
          ) : null}
        </ol>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        noValidate
      >
        <div className="rounded-[22px] border border-zk-border bg-zk-surface px-4 pb-2.5 pt-3 shadow-[0_2px_10px_rgba(0,0,0,0.06)] focus-within:border-electric-blue-strong/50">
          <label htmlFor={id} className="sr-only">What do you want to secure?</label>
          <textarea
            id={id}
            ref={box}
            name="target"
            rows={1}
            value={text}
            disabled={pending}
            maxLength={MESSAGE_MAX}
            placeholder={turns.length ? "Reply to Ziki" : "ziki.dev, or tell Ziki what you want to secure"}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : `${id}-reading`}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            className="block min-h-[28px] w-full resize-none border-0 bg-transparent p-1 text-[15px] leading-6 text-zk-text placeholder:text-zk-muted focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p id={`${id}-reading`} aria-live="polite" className="m-0 min-w-0 truncate px-1 text-[13px] text-zk-muted">
              {target ? (
                <span className="inline-flex items-center gap-1.5 text-zk-ok-fg">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                  {TARGET_KIND_LABEL[target.kind]}: <span className="font-semibold">{target.value}</span>
                </span>
              ) : isPrivate ? (
                <span className="text-zk-bad-fg">That&apos;s a private address</span>
              ) : null}
            </p>
            <button
              type="submit"
              disabled={pending || !value}
              aria-label="Send"
              title="Send"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zk-text text-zk-surface transition disabled:opacity-30"
            >
              {pending ? (
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              )}
            </button>
          </div>
        </div>
        {error ? <p id={errorId} role="alert" className="m-0 mt-2 px-2 text-sm text-zk-bad-fg">{error}</p> : null}
      </form>
    </div>
  );
}
