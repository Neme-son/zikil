import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { TARGET_KIND_LABEL } from "@/lib/security-checks";
import { jobLabel, jobReward, listAgentJobs, type AgentJobRow } from "@/lib/security-checks/your-work";
import { formatZ } from "@/lib/points/rules";
import { KindIcon } from "@/components/security-checks/entry-box";
import { PipelineSteps } from "@/components/pipeline-steps";
import { LocalTime } from "@/components/local-time";
// The same table as a project's Your Work list, so this reads like the rest of Ziki.
import "../../[org]/[project]/issues/_list/issues.css";

export const metadata = { title: "Your work" };

type Tab = "checking" | "done";
const TABS: { tab: Tab; label: string }[] = [
  { tab: "checking", label: "Checking" },
  { tab: "done", label: "Done" },
];

/**
 * Your work on Security (#security-checks): what your agents are checking for
 * other people. Only the job (the site, the part, checking or done) and what it
 * pays you, never the client's stages, payment or results. Fixing happens later,
 * in a project's issues, once the client sends a problem there.
 */
export default async function SecurityYourWorkPage(props: { searchParams?: Promise<{ tab?: string | string[] }> }) {
  const params = (await props.searchParams) ?? {};
  // Opens on what your agents are checking now; Done is the other tab.
  const selected: Tab = params.tab === "done" ? "done" : "checking";
  const user = await requireUser();
  const jobs = await listAgentJobs(user.id);
  const counts: Record<Tab, number> = {
    checking: jobs.filter((job) => job.status === "checking").length,
    done: jobs.filter((job) => job.status === "done").length,
  };
  const shown = jobs.filter((job) => job.status === selected);

  return (
    <div className="flex w-full flex-col gap-5 pb-10">
      <nav aria-label="Breadcrumb" className="text-sm text-zk-text2">
        <Link href="/security" className="hover:text-zk-text hover:underline">Security</Link>
        <span aria-hidden="true" className="px-2 text-zk-muted">/</span>
        <span className="font-semibold text-zk-text">Your Work</span>
      </nav>

      <div className="flex justify-center">
        <PipelineSteps
          label="Your security work"
          stages={TABS.map(({ tab, label }) => ({
            label,
            count: counts[tab],
            href: tab === "checking" ? "/security/work" : `/security/work?tab=${tab}`,
            selected: selected === tab,
          }))}
        />
      </div>

      <section aria-label="Jobs" className="rounded-[20px] border border-zk-border bg-zk-surface p-3 sm:p-6">
        <p className="mb-4 mt-0 px-1 text-sm text-zk-text2">
          Security checks your agents are doing for other people. You see the job and what it pays you, not the client&apos;s payment or what was found.
        </p>

        {shown.length === 0 ? (
          <div className="rounded-[10px] border border-zk-border bg-zk-bg px-6 py-12 text-center">
            <p className="m-0 font-semibold text-zk-text">
              {jobs.length === 0 ? "Your agents aren't checking anything yet" : selected === "checking" ? "Your agents aren't checking anything right now" : "Nothing finished yet"}
            </p>
            <p className="mx-auto mb-0 mt-1 max-w-md text-sm text-zk-text2">
              When one of your agents is given part of a security check, it shows here while it works and after it reports back.
            </p>
          </div>
        ) : (
          <>
            <div className="issues-table">
              <div className="issues-table-heading">
                <span className="w-[76px] shrink-0 text-center">Reward</span>
                <span className="min-w-0 flex-1">Job</span>
                <span className="hidden w-[120px] shrink-0 md:block">Status</span>
              </div>
              <ul className="m-0 list-none p-0">
                {shown.map((job, index) => (
                  <JobRow key={job.id} job={job} last={index === shown.length - 1} />
                ))}
              </ul>
            </div>
            <p className="mb-0 mt-4 px-1 text-sm text-zk-text2">
              Showing <b className="text-zk-text">{shown.length}</b> {shown.length === 1 ? "job" : "jobs"}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function JobRow({ job, last }: { job: AgentJobRow; last: boolean }) {
  const reward = jobReward(job);
  const status = statusOf(job);
  return (
    <li className={`issues-row flex items-center ${last ? "" : "border-b border-zk-divider"}`}>
      <span className="flex w-[76px] shrink-0 justify-center">
        <span className={`font-mono text-[14px] font-bold tabular-nums ${job.paid ? "text-zk-text" : "text-zk-ok-fg"}`} title={`Pays ${formatZ(reward)}`}>
          {formatZ(reward)}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg bg-zk-bg sm:grid">
          <KindIcon kind={job.targetKind} className="h-4 w-4 text-zk-text2" />
        </span>
        <span className="min-w-0">
          <span className="issues-row-title text-zk-text">{jobLabel(job)}</span>
          <span className="issues-row-meta flex items-center text-zk-muted">
            <span className="font-medium text-zk-text2">{job.targetValue}</span>
            <span>{TARGET_KIND_LABEL[job.targetKind]}</span>
            <span>{job.agentName}</span>
            {job.status === "checking" && job.assignedAt ? <LocalTime date={job.assignedAt} /> : job.reportedAt ? <LocalTime date={job.reportedAt} /> : null}
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold md:hidden ${status.tone}`}>{status.label}</span>
          </span>
        </span>
      </span>
      <span className="hidden w-[120px] shrink-0 md:flex">
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${status.tone}`}>{status.label}</span>
      </span>
    </li>
  );
}

/** The job's status in one word: checking, reported, or paid to you. */
function statusOf(job: AgentJobRow): { label: string; tone: string } {
  if (job.status === "checking") return { label: "Checking", tone: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" };
  if (job.paid) return { label: "Paid", tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
  return { label: "Reported", tone: "bg-zk-chip text-zk-text2" };
}
