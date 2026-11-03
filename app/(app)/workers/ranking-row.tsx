"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { formatZ as money } from "@/lib/points/rules";

/**
 * One person on Ranking: their standing, then the Team details (role, active
 * claims, agents). The agents button opens their agent table under the row.
 */
export function RankingRow({
  member,
  rank,
  medal,
  isYou,
  role,
  pct,
  goalMet,
  solved,
  points,
  recentPoints,
  claims,
  claimLimit,
  agentCount,
  onlineCount,
  last,
  children,
}: {
  member: { id: string; name: string; image: string | null };
  rank: number | null;
  /** Medal color for the top three. */
  medal?: string;
  isYou: boolean;
  role: "Owner" | "Admin" | "Member";
  pct: number;
  goalMet: boolean;
  solved: number;
  points: number;
  recentPoints: number;
  claims: number;
  claimLimit: number;
  agentCount: number;
  onlineCount: number;
  last: boolean;
  /** The member's agent table. */
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = `team-agents-${member.id}`;
  const youTone = isYou ? "bg-[#F3F8FF] shadow-[inset_3px_0_0_#2E6FEF] dark:bg-[#13254A]" : "";

  const agentsButton = agentCount ? (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-label={`${expanded ? "Hide" : "View"} agents for ${member.name}`}
      onClick={() => setExpanded(!expanded)}
      className="flex w-full items-center gap-2 rounded-lg bg-zk-chip px-2.5 py-1.5 text-left text-[13px] font-semibold text-zk-text hover:bg-zk-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue aria-expanded:bg-zk-tint"
    >
      <span>
        {agentCount} {agentCount === 1 ? "agent" : "agents"}
      </span>
      <span className={`team-online ${onlineCount > 0 ? "is-online" : ""}`}>{onlineCount} online</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        className={`ml-auto h-4 w-4 text-zk-muted motion-safe:transition-transform ${expanded ? "rotate-180" : ""}`}
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  ) : (
    <span className="text-sm text-zk-muted">No agents</span>
  );

  return (
    <li className={last ? "" : "border-b border-zk-divider"}>
      {/* Desktop: one wide row. */}
      <div data-testid="ranking-card-desktop" className={`hidden items-center gap-4 rounded-2xl px-4 py-3 md:flex ${youTone}`}>
        <span className="w-10 text-sm font-extrabold" style={{ color: medal }}>
          <span className={medal ? "" : "text-zk-muted"}>{rank ?? "—"}</span>
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={member.name} image={member.image} size="md" className="!h-9 !w-9 text-[13px] font-extrabold" />
          <Link href={`/users/${member.id}`} className="truncate text-[15px] font-semibold text-zk-text hover:underline">
            {member.name}
          </Link>
          {isYou ? (
            <span className="rounded-full bg-electric-blue-strong px-2 py-0.5 text-[11px] font-extrabold text-white">You</span>
          ) : null}
          {role !== "Member" ? (
            <span className="rounded-full bg-zk-chip px-2 py-0.5 text-[11px] font-semibold text-zk-text2">{role}</span>
          ) : null}
        </span>
        <span className="flex w-[200px] items-center gap-2.5">
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zk-tint">
            <span
              className="block h-full rounded-full"
              style={{ width: `${pct}%`, background: goalMet ? "#2E6FEF" : "#8FC9FF" }}
            />
          </span>
          <span className="w-10 text-right text-xs font-bold text-zk-text2">{pct}%</span>
        </span>
        <span className="w-[70px] text-right text-sm text-zk-text2">{solved}</span>
        <span className="flex w-[110px] flex-col items-end leading-tight">
          <span className="text-[15px] font-extrabold text-zk-text" title="Earned all time">
            {money(points)}
          </span>
          <span className="text-[11px] text-zk-muted" title="Earned this week (since Monday)">
            {money(recentPoints)} this week
          </span>
        </span>
        <span className="w-[90px] text-right text-sm font-semibold tabular-nums text-zk-text">
          {claims}
          <span className="font-normal text-zk-muted"> / {claimLimit}</span>
        </span>
        <span className="w-[190px]">{agentsButton}</span>
      </div>
      {/* Phone: the same facts stacked into a card. */}
      <div data-testid="ranking-card-phone" className={`flex flex-col gap-2.5 rounded-2xl px-3.5 py-3 md:hidden ${youTone}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="w-7 shrink-0 text-sm font-extrabold" style={{ color: medal }}>
            <span className={medal ? "" : "text-zk-muted"}>{rank ?? "—"}</span>
          </span>
          <Avatar name={member.name} image={member.image} size="md" className="!h-9 !w-9 shrink-0 text-[13px] font-extrabold" />
          <Link href={`/users/${member.id}`} className="min-w-0 truncate text-[15px] font-semibold text-zk-text hover:underline">
            {member.name}
          </Link>
          {isYou ? (
            <span className="shrink-0 rounded-full bg-electric-blue-strong px-2 py-0.5 text-[11px] font-extrabold text-white">You</span>
          ) : null}
          {role !== "Member" ? (
            <span className="shrink-0 rounded-full bg-zk-chip px-2 py-0.5 text-[11px] font-semibold text-zk-text2">{role}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zk-tint">
            <span
              className="block h-full rounded-full"
              style={{ width: `${pct}%`, background: goalMet ? "#2E6FEF" : "#8FC9FF" }}
            />
          </span>
          <span className="text-xs font-bold tabular-nums text-zk-text2">{pct}%</span>
        </div>
        <dl className="m-0 grid grid-cols-3 gap-2 rounded-xl bg-zk-chip px-2.5 py-2 text-center">
          <div>
            <dt className="text-[11px] text-zk-muted">Solved</dt>
            <dd className="m-0 text-[15px] font-extrabold tabular-nums text-zk-text">{solved}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-zk-muted">Earnings</dt>
            <dd className="m-0 text-[15px] font-extrabold tabular-nums text-zk-text">{money(points)}</dd>
            <dd className="m-0 text-[10px] text-zk-muted" title="Earned this week (since Monday)">{money(recentPoints)} this week</dd>
          </div>
          <div>
            <dt className="text-[11px] text-zk-muted">Claims</dt>
            <dd className="m-0 text-[15px] font-extrabold tabular-nums text-zk-text">
              {claims}
              <span className="font-normal text-zk-muted"> / {claimLimit}</span>
            </dd>
          </div>
        </dl>
        {agentCount ? agentsButton : null}
      </div>
      {agentCount > 0 ? (
        <section id={panelId} hidden={!expanded} aria-label={`Agents for ${member.name}`} className="team-agent-panel mb-3 rounded-2xl">
          <div className="team-agent-panel-heading">
            <h3>Agents for {member.name}</h3>
            <p>Agent activity and accepted fixes over the last 30 days.</p>
          </div>
          {children}
        </section>
      ) : null}
    </li>
  );
}
