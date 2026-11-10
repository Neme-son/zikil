import Link from "next/link";
import type { ReactNode } from "react";
import type { SecuritySeverity } from "@prisma/client";
import { LocalTime } from "@/components/local-time";
import { SEVERITY_LABEL } from "@/lib/security-severity";
import type { DashboardFinding } from "@/lib/security-dashboard";

/**
 * A list of security findings, in the shape Ziki's other lists use (ideas,
 * issues): a toolbar, a "Filter" row, one column header, the rows and a count.
 * A severity tile leads every row; what a viewer may not read stays hidden
 * (#security-findings).
 */

const TILE: Record<SecuritySeverity, string> = {
  critical: "bg-zk-bad-bg text-zk-bad-fg",
  high: "bg-zk-warn-bg text-zk-warn-fg",
  medium: "bg-zk-info-bg text-zk-info-fg",
  low: "bg-zk-chip text-zk-text2",
};

const columnLabel = "text-[13px] font-semibold text-zk-text2";

const stageChip =
  "inline-flex max-w-full items-center truncate rounded-full border border-zk-border bg-zk-bg px-2.5 py-1 text-xs font-semibold text-zk-text2";

export type SecurityFindingsKind = "open" | "disclosed";

export function SecurityFindingsCard({
  headingId,
  title,
  subtitle,
  toolbar,
  filters,
  findings,
  kind,
  filterHref,
  footer,
  empty,
}: {
  headingId: string;
  title: string;
  subtitle?: ReactNode;
  /** The row above the columns: the search form and the report action. */
  toolbar?: ReactNode;
  /** The "Filter" row: one link per workflow group. */
  filters?: ReactNode;
  findings: DashboardFinding[];
  kind: SecurityFindingsKind;
  /** The query in force, so opening a finding keeps the filters on the way back. */
  filterHref: string;
  footer: ReactNode;
  empty: ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-[20px] border border-zk-border bg-zk-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zk-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold text-zk-text">
            {title}
          </h2>
          {subtitle ? <p className="text-xs text-zk-muted">{subtitle}</p> : null}
        </div>
        {toolbar}
      </div>

      {filters ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-zk-divider px-4 py-2.5 sm:px-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-zk-muted">Filter</span>
          {filters}
        </div>
      ) : null}

      {findings.length ? (
        <>
          <div className="hidden items-center gap-4 border-b border-zk-divider px-4 py-2.5 sm:px-6 md:flex">
            <span className={`${columnLabel} w-[52px] shrink-0`}>Severity</span>
            <span className={`${columnLabel} min-w-0 flex-1`}>Finding</span>
            <span className={`${columnLabel} w-24 shrink-0 text-right`}>
              {kind === "open" ? "Open for" : "Took"}
            </span>
            {kind === "disclosed" ? <span className={`${columnLabel} w-44 shrink-0`}>Disclosed</span> : null}
            <span className={`${columnLabel} w-[150px] shrink-0`}>Stage</span>
          </div>
          <ul className="m-0 list-none p-0">
            {findings.map((finding) => (
              <li
                key={finding.id}
                className="flex items-center gap-4 border-b border-zk-divider px-4 py-3 last:border-b-0 sm:px-6"
              >
                <span
                  className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] px-1 text-center text-[11px] font-bold ${TILE[finding.severity]}`}
                >
                  {SEVERITY_LABEL[finding.severity]}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    <Link
                      href={
                        finding.canView
                          ? `/security/findings/${finding.id}${filterHref.slice("/security".length)}`
                          : finding.href
                      }
                      className="font-semibold text-zk-accent hover:underline"
                    >
                      {finding.ref}
                    </Link>
                    {finding.title ? (
                      <span className="break-words text-zk-text">{finding.title}</span>
                    ) : (
                      <span className="italic text-zk-muted">Details restricted</span>
                    )}
                  </span>
                  <span className="text-xs text-zk-muted">
                    {finding.project} · {finding.stage} · {finding.days} d
                  </span>
                </span>
                <span className="hidden w-24 shrink-0 text-right text-sm tabular-nums text-zk-text2 md:block">
                  {finding.days} d
                </span>
                {kind === "disclosed" ? (
                  <span className="hidden w-44 shrink-0 text-xs text-zk-text2 md:block">
                    {finding.disclosedAt ? <LocalTime date={finding.disclosedAt} /> : null}
                    <span className="block">
                      {finding.fixedLive ? "Fix live" : "Published by an owner or admin"}
                    </span>
                  </span>
                ) : null}
                <span className="hidden w-[150px] shrink-0 md:block">
                  <span className={stageChip}>{finding.stage}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="px-4 py-6 text-sm text-zk-text2 sm:px-6">{empty}</div>
      )}

      <div className="border-t border-zk-divider px-4 py-3 text-xs text-zk-text2 sm:px-6">{footer}</div>
    </section>
  );
}
