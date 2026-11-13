import Link from "next/link";
import type { SecuritySeverity } from "@prisma/client";
import { AgentAvatar } from "@/components/agent-avatar";
import { PipelineSteps } from "@/components/pipeline-steps";
import { RichText } from "@/components/rich-text";
import { SeverityChip } from "@/components/security-finding-panel";
import { ReportProgress } from "@/components/security-checks/report-progress";
import { Badge } from "@/components/ui/badge";
import { stateLabel, statusClass, substatusClass } from "@/lib/labels";
import { FINISHED_CHECK_STATUSES } from "@/lib/security-checks";
import type { CheckReport, ReportAgent, ResultFix, SeverityCounts } from "@/lib/security-checks/report";
import { SECURITY_SEVERITIES, SEVERITY_LABEL } from "@/lib/security-severity";

/**
 * "What we found" on a security check (#security-checks, part 4): one row per
 * problem, worst first, with who found it. A paid check shows every problem
 * with how to fix it. An unpaid one shows only what `loadCheckReport` handed
 * over: the worst problem without its fix, and how many more there are.
 */
export function ReportResults({ report, show = "all" }: { report: CheckReport; show?: FixFilter }) {
  const still = !FINISHED_CHECK_STATUSES.has(report.status);

  return (
    <section aria-labelledby="found-heading" className="overflow-hidden rounded-[20px] border border-zk-border bg-zk-surface">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <div>
          <h2 id="found-heading" className="text-base font-semibold text-zk-text">What we found</h2>
          <p className="text-xs text-zk-muted">Worst first. Only you can see these.</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-zk-text2">
          <LockIcon />
          Private
        </span>
      </div>

      {report.total === 0 ? (
        <p className="px-4 py-4 text-sm text-zk-text2 sm:px-6">
          {still ? "Nothing found yet. Problems show up here as agents find them." : "The agents found no problems."}
        </p>
      ) : report.paid ? (
        <PaidResults report={report} show={show} />
      ) : (
        <>
          {report.teaser ? (
            <div className="mt-3 border-t border-zk-border">
              <ProblemRow severity={report.teaser.severity} title={report.teaser.title} description={report.teaser.description} agent={report.teaser.agent}>
                <HowToFix>
                  <span className="text-zk-text2">in the full report.</span>
                </HowToFix>
              </ProblemRow>
            </div>
          ) : null}
          <div className="border-t border-zk-border px-4 py-4 sm:px-6">
            <div className="rounded-[14px] border border-zk-warn-bd bg-zk-warn-bg p-4">
              {report.hiddenCount > 0 ? (
                <CountsLine
                  counts={restCounts(report.counts, report.teaser?.severity)}
                  prefix={`${report.hiddenCount} more ${report.hiddenCount === 1 ? "problem" : "problems"} found${still ? " so far" : ""}:`}
                />
              ) : (
                <p className="text-sm font-medium text-zk-text">No other problems found{still ? " so far" : ""}.</p>
              )}
              <Link
                href={`/security/checks/${report.checkId}/pay`}
                className="mt-3 inline-flex h-10 items-center rounded-full bg-electric-blue-strong px-5 text-sm font-bold text-white hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2"
              >
                Pay {report.priceCoins} coins to see all
              </Link>
            </div>
          </div>
        </>
      )}

      {/* While agents work, the Progress card lists the parts; once finished, this footer does. */}
      {!still && report.parts.length ? <ClearFooter report={report} /> : null}
    </section>
  );
}

/** The "What we found" tabs, by where each problem's fix is (#security-findings). */
export type FixFilter = "all" | "not-sent" | "fixing" | "fixed" | "closed";
const FIX_FILTERS: { value: FixFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "not-sent", label: "Not sent" },
  { value: "fixing", label: "Fixing" },
  { value: "fixed", label: "Fixed" },
  { value: "closed", label: "Closed" },
];

export function parseFixFilter(value: string | string[] | undefined): FixFilter {
  return FIX_FILTERS.find((filter) => filter.value === value)?.value ?? "all";
}

function fixFilterOf(fix: ResultFix | null): Exclude<FixFilter, "all"> {
  return fix ? fix.bucket : "not-sent";
}

/**
 * A paid check's problems. Once any was sent with Fix on Ziki, tabs split
 * them by where their fix is, as the Findings page does.
 */
function PaidResults({ report, show }: { report: Extract<CheckReport, { paid: true }>; show: FixFilter }) {
  const anySent = report.results.some((result) => result.fix);
  const filter = anySent ? show : "all";
  const shown = filter === "all" ? report.results : report.results.filter((result) => fixFilterOf(result.fix) === filter);
  const count = (value: FixFilter) =>
    value === "all" ? report.results.length : report.results.filter((result) => fixFilterOf(result.fix) === value).length;
  const tabs = FIX_FILTERS.filter((tab) => tab.value !== "closed" || count("closed") > 0).map((tab) => ({
    label: tab.label,
    count: count(tab.value),
    href: tab.value === "all" ? `/security/checks/${report.checkId}` : `/security/checks/${report.checkId}?show=${tab.value}`,
    selected: filter === tab.value,
  }));

  return (
    <>
      {anySent ? (
        <div className="mt-3 px-4 sm:px-6">
          <PipelineSteps stages={tabs} label="Filter problems by where their fix is" />
        </div>
      ) : null}
      {shown.length ? (
        <ol className="mt-3 divide-y divide-zk-border border-t border-zk-border">
          {shown.map((result) => (
            <li key={result.id}>
              <ProblemRow severity={result.severity} title={result.title} description={result.description} agent={result.agent} fix={result.fix}>
                <HowToFix>
                  <RichText content={result.howToFix} className="min-w-0 text-sm" />
                </HowToFix>
              </ProblemRow>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 border-t border-zk-border px-4 py-4 text-sm text-zk-text2 sm:px-6">
          No problems here.{" "}
          <Link href={`/security/checks/${report.checkId}`} className="font-semibold text-zk-accent hover:underline">Show all</Link>
        </p>
      )}
    </>
  );
}

function ProblemRow({
  severity,
  title,
  description,
  agent,
  fix = null,
  children,
}: {
  severity: SecuritySeverity;
  title: string;
  description: string;
  agent: ReportAgent | null;
  fix?: ResultFix | null;
  children: React.ReactNode;
}) {
  return (
    <article className="grid gap-2 px-4 py-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:gap-4 sm:px-6">
      <div>
        <SeverityChip severity={severity} />
      </div>
      <div className="min-w-0">
        {/* A step above the description and fix (text-sm) so each problem's name stands out. */}
        <h3 className="wrap-break-word text-base font-bold text-zk-text">{title}</h3>
        <RichText content={description} className="mt-1 text-sm text-zk-text2" />
        <div className="mt-2 text-sm">{children}</div>
        {fix ? <FixLine fix={fix} /> : null}
      </div>
      {agent || fix?.recheck ? (
        <div className="flex flex-col gap-1.5 sm:items-end">
          {agent ? <AgentTag agent={agent} /> : null}
          {fix?.recheck ? <Recheck recheck={fix.recheck} /> : null}
        </div>
      ) : null}
    </article>
  );
}

/** Where a sent problem's fix is: its stage in Ziki's colours, then its issue, pull request and finding. */
function FixLine({ fix }: { fix: ResultFix }) {
  const badge = fix.substatus
    ? { label: stateLabel(fix.substatus), className: substatusClass[fix.substatus] }
    : {
        label: fix.stageLabel ?? "Reported",
        className: fix.bucket === "closed" ? statusClass.closed : substatusClass.requires_confirmation,
      };
  const link = "font-semibold text-zk-accent hover:underline";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zk-border pt-3 text-sm">
      <Badge className={badge.className}>{badge.label}</Badge>
      {fix.issue ? <Link href={fix.issue.href} className={link}>Issue #{fix.issue.number}</Link> : null}
      {fix.pullRequestHref ? (
        <a href={fix.pullRequestHref} className={link} target="_blank" rel="noreferrer">Pull request</a>
      ) : null}
      <Link href={fix.findingHref} className={link}>View finding →</Link>
    </div>
  );
}

/** "Checked again by Hana Tester ✓": the finding's latest independent verification. */
function Recheck({ recheck }: { recheck: { passed: boolean; by: string | null } }) {
  const who = recheck.by ?? "a former member";
  return recheck.passed ? (
    <p className="text-xs font-semibold text-zk-ok-fg">Checked again by {who} ✓</p>
  ) : (
    <p className="text-xs font-semibold text-zk-bad-fg">Re-check by {who} failed</p>
  );
}

/** "How to fix:" then the fix, on one line when it fits. A div, since the fix may be Markdown with its own blocks. */
function HowToFix({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1 text-zk-text">
      <span className="font-semibold">How to fix:</span>
      {children}
    </div>
  );
}

/** The agent that found it: its Ziki avatar, then its name. */
function AgentTag({ agent }: { agent: ReportAgent }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zk-text2 sm:justify-end sm:self-start">
      <AgentAvatar agentId={agent.id} avatar={agent.avatar} size={24} />
      <span className="wrap-break-word">
        <span className="sr-only">Found by </span>
        {agent.name}
      </span>
    </div>
  );
}

/** "36 clear · Security headers, Open pages and 34 more checks found nothing. See all checks" */
function ClearFooter({ report }: { report: CheckReport }) {
  const clear = report.clearParts;
  const named = clear.slice(0, 3);
  const rest = clear.length - named.length;
  return (
    <details className="security-report group border-t border-zk-border bg-zk-tint">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 text-sm sm:px-6">
        {clear.length ? (
          <>
            <span className="rounded-full bg-zk-ok-bg px-2.5 py-0.5 text-xs font-bold text-zk-ok-fg">{clear.length} clear</span>
            <span className="min-w-0 flex-1 text-zk-text2">
              {named.join(", ")}
              {rest > 0 ? ` and ${rest} more ${rest === 1 ? "check" : "checks"}` : ""} found nothing.
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 text-zk-text2">{report.progress.done} of {report.progress.total} checks done.</span>
        )}
        {/* The words follow the list: "See all checks" while closed, "Hide checks" once open. */}
        <span className="font-semibold text-zk-accent group-open:hidden">See all checks</span>
        <span className="hidden font-semibold text-zk-accent group-open:inline">Hide checks</span>
      </summary>
      <div className="border-t border-zk-border bg-zk-surface px-4 py-3 sm:px-6">
        <ReportProgress progress={report.progress} parts={report.parts} />
      </div>
    </details>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** "3 high · 5 medium · 2 low": only the severities that have any. */
function CountsLine({ counts, prefix }: { counts: SeverityCounts; prefix: string }) {
  const parts = SECURITY_SEVERITIES.filter((level) => counts[level] > 0).map(
    (level) => `${counts[level]} ${SEVERITY_LABEL[level].toLowerCase()}`,
  );
  return (
    <p className="text-sm font-medium text-zk-text">
      {prefix} {parts.join(" · ")}
    </p>
  );
}

/** The counts without the one problem already shown as the teaser. */
function restCounts(counts: SeverityCounts, shown: SecuritySeverity | undefined): SeverityCounts {
  if (!shown) return counts;
  return { ...counts, [shown]: counts[shown] - 1 };
}
