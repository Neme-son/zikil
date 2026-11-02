"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { sendAgentRequestAction } from "@/app/actions/agent-requests";
import { AGENTS_DOCK_HEIGHT } from "@/lib/agents-dock";
import { AgentAvatar } from "@/components/agent-avatar";
import { formatPoints, formatPointsAsDollars } from "@/lib/points/rules";

export type DockAgent = {
  id: string;
  name: string;
  avatar: string | null;
  status: "waiting" | "working" | "idle" | "offline";
  /** What it is doing now, in words (never invented). */
  activity: string;
  /** What its work has earned, in points (#710). */
  earnedPoints: number;
  /** Bids it has placed, comments it has written, and points earned today. */
  bids: number;
  comments: number;
  pointsToday: number;
  /** Things you asked it to do that it hasn't marked done (#agent-requests). */
  pendingRequests: number;
};

const STATUS_LABEL: Record<DockAgent["status"], string> = {
  working: "Working",
  waiting: "Waiting for you",
  idle: "Idle",
  offline: "Offline",
};

/** Each status moves the figure its own way (keyframes in app/globals.css). */
const MOTION: Record<DockAgent["status"], string> = {
  working: "motion-safe:animate-[zk-agent-work_0.9s_ease-in-out_infinite]",
  waiting: "motion-safe:animate-[zk-agent-wave_1.6s_ease-in-out_infinite]",
  idle: "motion-safe:animate-[zk-agent-breathe_3.2s_ease-in-out_infinite]",
  offline: "opacity-40 grayscale",
};

const DOT: Record<DockAgent["status"], string> = {
  working: "bg-emerald-500",
  waiting: "bg-amber-500",
  idle: "bg-sky-400",
  offline: "bg-zk-border",
};

/**
 * Your agents, always in view (#agents-dock): a bar fixed to the bottom of the
 * screen with each agent as a small animated figure. A working one bobs as it
 * works, one waiting for you waves, an idle one breathes, an offline one sits
 * greyed out. Hover for what it is doing; click to paste instructions for it,
 * which reach it at the top of its work feed on its next poll (#agent-requests).
 * Wide screens only: on phones the bottom of the screen holds the navigation tabs.
 */

export function AgentsDock({ agents }: { agents: DockAgent[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (agents.length === 0) return null;
  return (
    // A dedicated strip across the bottom of the screen, its height AGENTS_DOCK_HEIGHT:
    // the page reserves that much at its foot, so everything scrolls above it.
    <nav
      aria-label="Your agents"
      style={{ height: AGENTS_DOCK_HEIGHT }}
      className="fixed inset-x-0 bottom-0 z-30 hidden items-center gap-4 border-t border-zk-border bg-zk-surface px-6 shadow-[0_-2px_10px_rgba(11,23,51,0.06)] lg:flex"
    >
      {/* The agents sit in the middle of the strip; its name ("Your agents") is for screen readers. */}
      <ul className="m-0 mx-auto flex min-w-0 max-w-full list-none items-center justify-center gap-8 overflow-x-auto p-0">
        {agents.map((agent) => (
          <li key={agent.id} className="relative">
            {openId === agent.id ? <RequestBox agent={agent} onClose={() => setOpenId(null)} /> : null}
            <button
              type="button"
              onClick={() => setOpenId(openId === agent.id ? null : agent.id)}
              aria-expanded={openId === agent.id}
              title={`${agent.name} · ${STATUS_LABEL[agent.status]}: ${agent.activity}`}
              aria-label={`${agent.name}, ${STATUS_LABEL[agent.status]}: ${agent.activity}; earned ${formatPointsAsDollars(agent.earnedPoints)}, ${formatPointsAsDollars(agent.pointsToday)} today; ${agent.bids} bids, ${agent.comments} comments`}
              className={`group flex items-center gap-2.5 rounded-xl px-2 py-1 text-left hover:bg-zk-chip focus-visible:outline-2 focus-visible:outline-electric-blue ${openId === agent.id ? "bg-zk-chip" : ""}`}
            >
              <span className="relative">
                <span className={`block origin-bottom ${MOTION[agent.status]}`}>
                  <AgentAvatar agentId={agent.id} avatar={agent.avatar} size={34} />
                </span>
                <span aria-hidden="true" className={`absolute -right-0.5 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-zk-surface ${DOT[agent.status]}`} />
                {agent.pendingRequests ? (
                  <span title={`${agent.pendingRequests} request${agent.pendingRequests === 1 ? "" : "s"} waiting`} className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-electric-blue-strong px-1 text-[10px] font-bold text-white">
                    {agent.pendingRequests}
                  </span>
                ) : null}
              </span>
              {/* Its name and what it has earned, then what it has done. */}
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="flex items-baseline gap-1.5">
                  <span className="max-w-32 truncate text-[12px] font-semibold text-zk-text2 group-hover:text-zk-text">{agent.name}</span>
                  <span className="font-mono text-[12px] font-bold tabular-nums text-zk-ok-fg" title={`Earned ${formatPoints(agent.earnedPoints)} points in all`}>
                    {formatPointsAsDollars(agent.earnedPoints)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2 whitespace-nowrap text-[11px] tabular-nums text-zk-muted">
                  <span title={`${agent.bids} ${agent.bids === 1 ? "bid" : "bids"} placed`}>{agent.bids} {agent.bids === 1 ? "bid" : "bids"}</span>
                  <span aria-hidden="true">·</span>
                  <span title={`${agent.comments} ${agent.comments === 1 ? "comment" : "comments"} written`}>{agent.comments} {agent.comments === 1 ? "comment" : "comments"}</span>
                  <span aria-hidden="true">·</span>
                  <span className={agent.pointsToday > 0 ? "font-semibold text-zk-ok-fg" : ""} title={`Earned ${formatPoints(agent.pointsToday)} points today`}>
                    +{formatPointsAsDollars(agent.pointsToday)} today
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Paste instructions for one agent (#agent-requests): what you send shows at
 * the top of its work feed ("Your owner asked you to ...") on its next poll,
 * until it marks it done. The issue pages' "Instructions for Agent" text goes
 * here as it is.
 */
function RequestBox({ agent, onClose }: { agent: DockAgent; onClose: () => void }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.parentElement?.contains(target) && !text.trim()) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose, text]);

  function send() {
    setStatus(null);
    startTransition(async () => {
      const result = await sendAgentRequestAction(agent.id, text);
      if (result.error) setStatus({ error: result.error });
      else {
        setText("");
        setStatus({ ok: true });
      }
    });
  }

  const hint = status?.error
    ?? (status?.ok
      ? `Sent. ${agent.name} sees it on its next poll.`
      : agent.pendingRequests
        ? `${agent.pendingRequests} earlier request${agent.pendingRequests === 1 ? "" : "s"} waiting.`
        : "It sees this on its next poll.");

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`Instructions for ${agent.name}`}
      className="absolute bottom-full left-1/2 z-40 mb-3 w-[380px] -translate-x-1/2 rounded-2xl border border-zk-border bg-zk-surface p-3 shadow-[0_12px_32px_rgba(11,23,51,0.18)]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="m-0 text-sm font-bold text-zk-text">Instructions for {agent.name}</p>
        <Link href="/agents" className="text-xs font-semibold text-zk-accent hover:underline">Settings</Link>
      </div>
      <label htmlFor={`request-${agent.id}`} className="sr-only">{`What should ${agent.name} do?`}</label>
      <textarea
        id={`request-${agent.id}`}
        // Opened by tapping the agent, so typing or pasting can start at once.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        rows={5}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setStatus(null);
        }}
        placeholder="Paste instructions (the Instructions for Agent text from an issue), or say what to do."
        className="w-full resize-y rounded-xl border border-zk-border bg-zk-surface px-3 py-2 text-[13px] text-zk-text focus:border-electric-blue-strong focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className={`m-0 text-xs ${status?.error ? "text-zk-bad-fg" : "text-zk-muted"}`} role={status ? "status" : undefined}>{hint}</p>
        <button
          type="button"
          onClick={send}
          disabled={pending || !text.trim()}
          className="inline-flex h-8 items-center rounded-lg bg-electric-blue-strong px-3 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
