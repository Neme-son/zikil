"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect, useRef } from "react";
import { deleteTimeEntryAction } from "@/app/actions/time-tracking";
import { formatDuration } from "@/lib/time-tracking";

export type TimeEntryView = {
  id: string;
  minutes: number;
  note: string | null;
  spentOnLabel: string;
  userId: string;
  userName: string;
  source: string;
};

type Props = {
  bugId: string;
  isAdmin: boolean;
  entries: TimeEntryView[];
  /** Whether the issue is currently in progress (show live tracking). */
  isTracking: boolean;
  /** Active minutes tracked so far (live). */
  activeMinutes: number;
  /** When tracking started (ISO string). */
  startedAt: string | null;
};

export function TimeTrackingPanel({
  bugId,
  isAdmin,
  entries,
  isTracking,
  activeMinutes,
  startedAt,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = entries.reduce((sum, entry) => sum + entry.minutes, 0);

  // Send heartbeat every 5 minutes while in progress and tab is visible.
  useEffect(() => {
    if (!isTracking) return;

    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bugId }),
      }).catch(() => {});
    };

    // Send one immediately, then on interval.
    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 5 * 60 * 1000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [isTracking, bugId]);

  const remove = (entryId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteTimeEntryAction(entryId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  // Live tracking duration (computed in effect to keep render pure).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isTracking) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [isTracking]);
  const liveMinutes = startedAt
    ? Math.floor((now - new Date(startedAt).getTime()) / 60000)
    : 0;

  return (
    <section aria-label="Time tracking" data-testid="time-tracking-panel" className="rounded-[20px] border border-zk-border bg-zk-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-zk-muted">Time tracking</h2>
        <span className="rounded-full bg-zk-chip px-2.5 py-0.5 text-sm font-semibold tabular-nums text-zk-text" aria-label={`Total time logged: ${formatDuration(total)}`}>
          {formatDuration(total)} logged
        </span>
      </div>

      {/* Live tracking indicator */}
      {isTracking ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-zk-tint px-3 py-2 text-sm text-zk-accent">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zk-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-zk-accent" />
          </span>
          <span>
            Tracking... {formatDuration(Math.max(activeMinutes, liveMinutes > 0 ? liveMinutes : 0))} active
          </span>
          <span className="text-xs text-zk-muted">(auto-stops when issue is resolved)</span>
        </div>
      ) : null}

      {entries.length ? (
        <ul className="mt-3 space-y-2 text-sm text-zk-text2">
          {entries.map((entry) => {
            const canRemove = isAdmin;
            const isAuto = entry.source === "auto";
            return (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-zk-border/60 pb-2 last:border-b-0 last:pb-0">
                <span className="font-semibold tabular-nums text-zk-text">{formatDuration(entry.minutes)}</span>
                {isAuto ? (
                  <span className="rounded-full bg-zk-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zk-accent">Auto</span>
                ) : (
                  <span className="rounded-full bg-zk-chip px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zk-muted">Manual</span>
                )}
                <span className="text-zk-muted">{entry.userName}</span>
                <span className="text-zk-muted">· {entry.spentOnLabel}</span>
                {entry.note ? <span className="w-full text-zk-text2">{entry.note}</span> : null}
                {canRemove ? (
                  <button type="button" disabled={pending} onClick={() => remove(entry.id)} className="text-xs text-zk-muted underline hover:text-zk-text disabled:opacity-50">
                    Remove
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 mt-2 text-sm text-zk-muted">
          {isTracking ? "Time will be logged automatically when this issue is resolved." : "No time tracked yet. Time is logged automatically when work is in progress."}
        </p>
      )}

      {error ? <p role="alert" className="m-0 mt-2 text-sm text-zk-bad-fg">{error}</p> : null}
    </section>
  );
}
