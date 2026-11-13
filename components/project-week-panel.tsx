"use client";

import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import type { WeekPerson } from "@/lib/project-week";

/** The top this many show; See all opens the rest. */
const TOP = 5;

/** The top three's medals: gold, silver and bronze. */
const MEDALS = [
  { label: "1st", ribbon: "#3B82F6", disc: "#F5B301", rim: "#C98A00" },
  { label: "2nd", ribbon: "#8B5CF6", disc: "#C9D1DB", rim: "#8C97A6" },
  { label: "3rd", ribbon: "#EF4444", disc: "#D9894A", rim: "#A15A23" },
] as const;

function Medal({ place }: { place: 0 | 1 | 2 }) {
  const medal = MEDALS[place];
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" role="img" aria-label={`${medal.label} this week`} className="shrink-0">
      <path d="M4 0h4l2 7H6z" fill={medal.ribbon} />
      <path d="M10 0h4l-2 7H8z" fill={medal.ribbon} opacity="0.75" />
      <circle cx="9" cy="14" r="7" fill={medal.disc} stroke={medal.rim} strokeWidth="1.5" />
      <text x="9" y="17.2" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={medal.rim}>
        {place + 1}
      </text>
    </svg>
  );
}

/**
 * One person's tickets as a fat bar, left to right on the panel's shared scale:
 * this week's part first (dark), then the ones delivered before (light). Their
 * name sits inside at the left (white where it crosses the dark part), and the
 * two counts sit in chips of the same colours at the end of the filled part,
 * never closer to the left than the name's room, so the two never meet.
 */
function SegmentedBar({ name, you, delivered, overall, most }: { name: string; you: boolean; delivered: number; overall: number; most: number }) {
  const earlier = overall - delivered;
  const filled = overall > 0 ? Math.max(8, (overall / most) * 100) : 0;
  const dark = overall > 0 ? (filled * delivered) / overall : 0;
  const label = (
    <>
      {name}
      {you ? <span className="ml-1 font-normal opacity-75">(you)</span> : null}
    </>
  );
  return (
    <div
      role="img"
      aria-label={`${name}${you ? " (you)" : ""}: ${delivered} ${delivered === 1 ? "ticket" : "tickets"} this week, ${overall} in all`}
      className="relative h-10 w-full min-w-0 overflow-hidden rounded-full bg-zk-chip"
    >
      {overall > 0 ? (
        <div className="absolute inset-y-0 left-0 flex motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${filled}%` }}>
          {delivered > 0 ? <span className="h-full bg-electric-blue-strong" style={{ flexGrow: delivered, flexBasis: 0 }} /> : null}
          {earlier > 0 ? <span className="h-full bg-electric-blue/30" style={{ flexGrow: earlier, flexBasis: 0 }} /> : null}
        </div>
      ) : null}
      {/* The name: dark over the light part and the empty track, white over the dark part. */}
      <span className="absolute inset-0 flex items-center pl-4 text-sm font-semibold text-zk-text">
        <span className="max-w-[13rem] truncate">{label}</span>
      </span>
      {dark > 0 ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center pl-4 text-sm font-semibold text-white"
          style={{ clipPath: `inset(0 ${100 - dark}% 0 0)` }}
        >
          <span className="max-w-[13rem] truncate">{label}</span>
        </span>
      ) : null}
      {/* The counts, at the end of the filled part, but always right of the name's room. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 flex items-center gap-1 pr-1.5"
        style={{ right: `min(${100 - filled}%, calc(100% - 17rem))`, left: "auto" }}
      >
        {overall > 0 ? (
          <>
            <span className="rounded-full bg-electric-blue-strong px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-white ring-2 ring-white/70">{delivered}</span>
            <span className="rounded-full bg-zk-surface px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-zk-accent ring-1 ring-electric-blue/30">{earlier}</span>
          </>
        ) : (
          <span className="pr-2 text-[11px] font-medium text-zk-muted">None yet</span>
        )}
      </span>
    </div>
  );
}

/**
 * Project Overview's first panel (#project-overview): the top five people by
 * tickets delivered this week, each with a bar filling left to right, the top
 * three with a medal. See all opens everyone else. `action` sits at the top
 * right (the Goals button).
 */
export function ProjectWeekPanel({ people, viewerId, action }: { people: WeekPerson[]; viewerId: string | null; action?: ReactNode }) {
  const [all, setAll] = useState(false);
  // Bars share one scale: the most anyone delivered overall fills the track.
  const most = Math.max(1, ...people.map((person) => person.overall));
  const total = people.reduce((sum, person) => sum + person.delivered, 0);
  const shown = all ? people : people.slice(0, TOP);
  return (
    <section aria-labelledby="week-panel-heading" className="rounded-[20px] border border-zk-border bg-zk-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div>
          <h2 id="week-panel-heading" className="text-base font-bold text-zk-text">Top contributors this week</h2>
          <p className="mt-0.5 text-xs text-zk-muted">
            {total === 1 ? "1 ticket" : `${total} tickets`} delivered since Monday
          </p>
          {/* What the two parts of each bar are. */}
          <p className="mt-2 flex items-center gap-3 text-[11px] font-medium text-zk-text2">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-electric-blue-strong" />This week</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-electric-blue/30" />Before this week</span>
          </p>
        </div>
        {action}
      </div>
      {people.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-zk-muted">Nobody is in this organisation yet.</p>
      ) : (
        <ol className="m-0 list-none divide-y divide-zk-divider px-5 py-1">
          {shown.map((person, index) => {
            const you = person.id === viewerId;
            const medal = index < 3 && person.delivered > 0 ? (index as 0 | 1 | 2) : null;
            return (
              <li key={person.id} className="flex items-center gap-3 py-2.5">
                <span
                  aria-label={`Rank ${index + 1}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zk-tint font-mono text-xs font-bold tabular-nums text-zk-accent"
                >
                  {index + 1}
                </span>
                <Avatar name={person.name} image={person.image} size="lg" />
                <SegmentedBar name={person.name} you={you} delivered={person.delivered} overall={person.overall} most={most} />
                {/* The medal at the end of the bar; an empty slot keeps every bar the same length. */}
                <span className="flex w-5 shrink-0 justify-center">{medal !== null ? <Medal place={medal} /> : null}</span>
              </li>
            );
          })}
        </ol>
      )}
      {people.length > TOP ? (
        <div className="border-t border-zk-divider px-5 py-2.5 text-right">
          <button
            type="button"
            onClick={() => setAll((open) => !open)}
            aria-expanded={all}
            className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-zk-accent hover:bg-zk-chip focus-visible:outline-2 focus-visible:outline-electric-blue"
          >
            {all ? "Show the top 5" : `See all ${people.length}`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
