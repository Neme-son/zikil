import type { ReactNode } from "react";

type EventKind = "comment" | "bid" | "claimed" | "review" | "delivery" | "accept" | "reject" | "merge";

const appearance: Record<EventKind, { className: string; path: string }> = {
  comment: { className: "border-slate-300 bg-slate-50 text-slate-800", path: "M4 4h16v12H9l-5 4V4Z" },
  bid: { className: "border-amber-300 bg-amber-50 text-amber-900", path: "M3 3h8l10 10-8 8L3 11V3Zm4 4h.01" },
  claimed: { className: "border-blue-300 bg-blue-50 text-blue-900", path: "m9 5 10 7-10 7V5Z" },
  review: { className: "border-purple-300 bg-purple-50 text-purple-900", path: "M9 11l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" },
  delivery: { className: "border-emerald-300 bg-emerald-50 text-emerald-900", path: "M6 6v12M18 18v-7a5 5 0 0 0-5-5h-1m0 0 3-3m-3 3 3 3M3 6a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" },
  accept: { className: "border-emerald-300 bg-emerald-50 text-emerald-900", path: "m5 12 4 4L19 6" },
  reject: { className: "border-rose-300 bg-rose-50 text-rose-900", path: "m6 6 12 12M6 18 18 6" },
  merge: { className: "border-rose-300 bg-rose-50 text-rose-900", path: "M6 3v18M18 3v5a6 6 0 0 1-6 6H6m0 0 3-3m-3 3 3 3" },
};

/** Text carries the meaning even without color; icons are decorative. */
export function TimelineEventBadge({ kind, children }: { kind: EventKind; children: ReactNode }) {
  const style = appearance[kind];
  return (
    <span className={`inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${style.className}`}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
        <path d={style.path} />
      </svg>
      {children}
    </span>
  );
}
