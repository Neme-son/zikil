"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { AGENT_AVATARS } from "@/lib/agents/avatars";
import { useToast } from "@/components/ui/toast";
import { agentsMutedClass, agentsSecondaryBtn } from "@/app/(app)/settings/agents/agents-ui";
import { setAgentAvatarAction } from "./actions";

const OPTIONS: { key: string | null; label: string }[] = [
  { key: null, label: "Automatic" },
  ...AGENT_AVATARS.map(({ key, label }) => ({ key, label })),
];

/**
 * The agent's avatar on its page, as a button: it opens a pop-up of robots to
 * pick from. "Automatic" is the one drawn from the agent's id. A pick saves at
 * once, closes the pop-up and shows wherever the agent does.
 */
export function AgentAvatarPicker({
  agentId,
  agentName,
  avatar,
  size = 72,
}: {
  agentId: string;
  agentName: string;
  avatar: string | null;
  size?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(avatar);
  const [pending, startTransition] = useTransition();

  // showModal() gives the focus trap, inert background and Escape handling.
  useEffect(() => {
    if (open) dialogRef.current?.showModal();
  }, [open]);

  function pick(next: string | null) {
    if (next === current) {
      setOpen(false);
      return;
    }
    const previous = current;
    setCurrent(next);
    setOpen(false);
    startTransition(async () => {
      const result = await setAgentAvatarAction(agentId, next);
      if (!result.ok) {
        setCurrent(previous);
        toast(result.error, "error");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        aria-haspopup="dialog"
        aria-label={`Change ${agentName}'s avatar`}
        title="Change avatar"
        className="group relative shrink-0 rounded-full transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2 disabled:cursor-wait motion-reduce:hover:scale-100"
      >
        <AgentAvatar agentId={agentId} avatar={current} size={size} />
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-zk-surface bg-electric-blue-strong text-white"
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </span>
      </button>

      {open ? (
        <dialog
          ref={dialogRef}
          aria-labelledby="avatar-picker-title"
          // Escape reaches us as `cancel`.
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
          className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[20px] border border-zk-border bg-zk-surface p-6 text-zk-text shadow-xl backdrop:bg-black/50"
        >
          <h2 id="avatar-picker-title" className="text-lg font-extrabold">
            Choose an avatar for {agentName}
          </h2>
          <p className={`mt-1 ${agentsMutedClass}`}>It shows wherever {agentName} does.</p>
          <div role="radiogroup" aria-label="Avatar" className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {OPTIONS.map((option) => {
              const on = option.key === current;
              return (
                <button
                  key={option.key ?? "automatic"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(option.key)}
                  className={`group flex flex-col items-center gap-1.5 rounded-2xl p-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue ${
                    on ? "bg-zk-tint text-zk-accent ring-2 ring-electric-blue-strong" : "text-zk-text2 hover:bg-zk-chip"
                  }`}
                >
                  <AgentAvatar agentId={agentId} avatar={option.key} size={56} />
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className={agentsSecondaryBtn}>
              Cancel
            </button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
