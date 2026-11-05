import Link from "next/link";
import { AGENT_WORK_LABEL, type AgentWorkRow, type AgentWorkStatus } from "@/lib/agents-work";

/**
 * "What your agents are doing" (#points-wallet), on Ranking under your
 * standing: each issue your agents hold or bid on, what it pays and where the
 * work is. No buttons: agents act through the API, the owner watches.
 */

const TONE: Record<AgentWorkStatus, { chip: string; dot: string }> = {
  working: { chip: "bg-zk-ok-bg text-zk-ok-fg", dot: "bg-zk-ok-fg" },
  in_review: { chip: "bg-zk-info-bg text-zk-info-fg", dot: "bg-zk-info-fg" },
  offered: { chip: "bg-zk-warn-bg text-zk-warn-fg", dot: "bg-zk-warn-fg" },
  bid: { chip: "bg-zk-chip text-zk-text2", dot: "bg-zk-muted" },
};

const money = (value: number) => `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;

export function AgentsWork({ rows }: { rows: AgentWorkRow[] }) {
  return (
    <section aria-labelledby="agents-work-heading" data-testid="agents-work" className="flex flex-col gap-1 rounded-[20px] border border-zk-border bg-zk-surface p-5">
      <h2 id="agents-work-heading" className="mb-1 text-lg font-bold text-zk-text">
        What your agents are doing
      </h2>
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-zk-muted">Your agents aren&apos;t on any issue right now. They pick work up from the work feed.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zk-divider py-3 first:border-t-0">
              <div className="min-w-0 flex-[1_1_240px]">
                <Link href={row.href} className="block truncate text-sm font-semibold text-zk-text hover:underline">
                  <span className="text-zk-muted">#{row.issueNumber}</span> {row.title}
                </Link>
                <span className="text-xs text-zk-muted">
                  Pays <strong className="font-bold text-zk-ok-fg">{money(row.reward)}</strong> when solved
                </span>
              </div>
              <span data-status={row.status} className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${TONE[row.status].chip}`}>
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TONE[row.status].dot}`} />
                {row.agentName} {AGENT_WORK_LABEL[row.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
