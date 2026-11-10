import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requireUser } from "@/lib/auth-helpers";
import { currentOrganisationAccess } from "@/lib/organisation-access";
import { prisma } from "@/lib/prisma";
import { loadSecurityDashboard } from "@/lib/security-dashboard";
import { isSecuritySeverity, SECURITY_SEVERITIES, SEVERITY_GUIDE, SEVERITY_LABEL } from "@/lib/security-severity";
import { newIssuePath, type ProjectRef } from "@/lib/project-paths";
import { SeverityChip } from "@/components/security-finding-panel";
import { AgentClearanceToggle } from "@/components/security-finding-controls";
import { PipelineSteps } from "@/components/pipeline-steps";
import { SecuritySettingsLink } from "@/components/security/security-settings-link";
import { SecurityFindingsCard } from "@/components/security-findings-card";
import {
  filterSecurityFindingsByStage,
  parseSecurityStageFilter,
  SecurityStageFilterBar,
  type SecurityStageFilter,
} from "@/components/security-stage-filter";
import { OrgPageHeader, ReadOnlyNote, orgCard, orgListCard } from "../[org]/[project]/org/org-ui";

export const metadata = { title: "Security" };

/**
 * The Security area (#security-findings): report a vulnerability privately,
 * see how exposed the workspace is, follow each finding to its fix, and read
 * the ones already disclosed. Owners and admins also choose which agents may
 * read private findings.
 */
type SearchParams = Promise<{
  severity?: string | string[];
  stage?: string | string[];
  q?: string | string[];
  project?: string | string[];
  assignee?: string | string[];
  reporter?: string | string[];
}>;

export default async function SecurityPage(props: {
  searchParams?: SearchParams;
}) {
  const params = (await props.searchParams) ?? {};
  const severity = typeof params.severity === "string" ? params.severity.toLowerCase() : "";
  const selectedSeverity = isSecuritySeverity(severity) ? severity : "all";
  const selectedStage = parseSecurityStageFilter(params.stage);
  const search = {
    q: typeof params.q === "string" ? params.q.trim().slice(0, 200) : "",
    project: typeof params.project === "string" ? params.project : "",
    assignee: typeof params.assignee === "string" ? params.assignee.trim().slice(0, 200) : "",
    reporter: params.reporter === "person" || params.reporter === "agent" ? params.reporter : "",
  };
  const searchQuery = new URLSearchParams(Object.entries(search).filter(([, value]) => value));
  const user = await requireUser();
  const access = await currentOrganisationAccess(user.id, user.role);
  if (!access.organisationId) {
    return (
      <div className="space-y-4">
        <OrgPageHeader heading="h1" title="Security" actions={
          <div className="flex items-center gap-2">
            <Link href="/security/activity" className="text-sm font-semibold text-zk-accent hover:underline">Activity</Link>
            <SecuritySettingsLink />
          </div>
        }>Report and track security findings.</OrgPageHeader>
        <ReadOnlyNote>Join or create a workspace to report and track security findings.</ReadOnlyNote>
        <SecurityStageFilterBar findings={[]} selected={selectedStage} severity={selectedSeverity} />
      </div>
    );
  }
  const organisationId = access.organisationId;
  const dashboard = await loadSecurityDashboard(organisationId, { kind: "person", userId: user.id, organisationId, organisationAdmin: access.admin }, undefined, search);
  const agents = access.admin
    ? (
        await prisma.agentActivation.findMany({
          where: { organisationId, deactivatedAt: null, agent: { revokedAt: null } },
          orderBy: [{ securityCleared: "desc" }, { agent: { name: "asc" } }],
          take: 200,
          select: { level: true, securityCleared: true, agent: { select: { id: true, name: true, owner: { select: { name: true } } } } },
        })
      ).map(({ agent, level, securityCleared }) => ({ ...agent, level, securityCleared }))
    : [];
  const filteredDisclosed = selectedSeverity === "all"
    ? dashboard.disclosed
    : dashboard.disclosed.filter((f) => f.severity === selectedSeverity);

  const visibleOpen = filterSecurityFindingsByStage(
    selectedSeverity === "all" ? dashboard.open : dashboard.open.filter((f) => f.severity === selectedSeverity),
    selectedStage,
  );
  const findings = [...dashboard.open, ...dashboard.disclosed];
  const severitySteps = (["all", ...SECURITY_SEVERITIES] as const).map((level) => ({
    label: level === "all" ? "All" : SEVERITY_LABEL[level],
    count: level === "all" ? findings.length : findings.filter((finding) => finding.severity === level).length,
    href: securityFilterHref(level, selectedStage, searchQuery),
    selected: selectedSeverity === level,
  }));
  const openCount = dashboard.open.length;
  const severe = dashboard.openBySeverity.critical + dashboard.openBySeverity.high;
  const filterHref = securityFilterHref(selectedSeverity, selectedStage, searchQuery);

  return (
    <div className="flex w-full flex-col gap-4 pb-10 sm:gap-6">
      <OrgPageHeader heading="h1" title="Security" actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/security/activity" className="text-sm font-semibold text-zk-accent hover:underline">Activity</Link>
          <SecuritySettingsLink />
          <ReportButton projects={dashboard.projects} />
        </div>
      }>
        Report vulnerabilities privately. A workspace owner or admin decides when to publish them.
      </OrgPageHeader>

      <section aria-label="Summary" className={`${orgListCard} grid grid-cols-2 sm:grid-cols-4`}>
        <Stat label="Open findings" value={String(openCount)} hint={openCount ? "Private until published" : "Nothing open"} />
        <Stat
          label="Critical and high"
          value={String(severe)}
          hint={`${dashboard.openBySeverity.critical} critical, ${dashboard.openBySeverity.high} high`}
          alert={severe > 0}
        />
        <Stat label="Disclosed" value={String(dashboard.disclosed.length)} hint="Details now public" />
        <Stat
          label="Median time to disclose"
          value={dashboard.medianDaysToDisclosure === null ? "–" : `${dashboard.medianDaysToDisclosure} d`}
          hint="From report to publication"
        />
      </section>

      <div className="flex justify-center">
        <PipelineSteps stages={severitySteps} label="Filter findings by severity" />
      </div>

      <SecurityFindingsCard
        headingId="open-heading"
        title="Open findings"
        subtitle="Worst first, then oldest."
        toolbar={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ReportButton projects={dashboard.projects} variant="quiet" />
            <form action="/security" className="flex flex-wrap items-center gap-2">
              {selectedSeverity !== "all" ? <input type="hidden" name="severity" value={selectedSeverity} /> : null}
              {selectedStage !== "all" ? <input type="hidden" name="stage" value={selectedStage} /> : null}
              <label htmlFor="security-q" className="sr-only">Finding title or ID</label>
              <input id="security-q" name="q" defaultValue={search.q} maxLength={200} placeholder="Search findings" className={SEARCH_FIELD} />
              <details className="relative">
                <summary aria-label="More search filters" title="More search filters" className={FILTER_BUTTON}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h9M17 7h3M4 17h5M13 17h7M4 12h3M11 12h9" />
                    <circle cx="15" cy="7" r="2" />
                    <circle cx="11" cy="17" r="2" />
                    <circle cx="9" cy="12" r="2" />
                  </svg>
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-2xl border border-zk-border bg-zk-surface p-3 shadow-lg">
                  <label htmlFor="security-project" className="block space-y-1 text-sm text-zk-text2">Project
                    <Select id="security-project" name="project" defaultValue={search.project}>
                      <option value="">All projects</option>
                      {dashboard.projects.map((project) => <option key={project.ref} value={project.ref.split("/").at(-1)}>{project.name}</option>)}
                    </Select>
                  </label>
                  <label htmlFor="security-assignee" className="block space-y-1 text-sm text-zk-text2">Assignee
                    <Input id="security-assignee" name="assignee" defaultValue={search.assignee} placeholder="Name or unassigned" maxLength={200} />
                  </label>
                  <label htmlFor="security-reporter" className="block space-y-1 text-sm text-zk-text2">Reporter
                    <Select id="security-reporter" name="reporter" defaultValue={search.reporter}>
                      <option value="">Everyone</option>
                      <option value="person">Person</option>
                      <option value="agent">Agent</option>
                    </Select>
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit">Apply filters</Button>
                    {searchQuery.size ? <Link href={securityFilterHref(selectedSeverity, selectedStage)} className="text-sm font-semibold text-zk-accent hover:underline">Clear search filters</Link> : null}
                  </div>
                </div>
              </details>
            </form>
          </div>
        }

        filters={<SecurityStageFilterBar findings={dashboard.open} selected={selectedStage} severity={selectedSeverity} search={searchQuery} />}
        findings={visibleOpen}
        kind="open"
        filterHref={filterHref}
        footer={`Showing ${visibleOpen.length} of ${openCount} open ${openCount === 1 ? "finding" : "findings"}`}
        empty={
          selectedStage === "all" && selectedSeverity === "all" && !searchQuery.size ? (
            <p>No open security findings. Found something? Report it privately.</p>
          ) : selectedSeverity === "all" && !searchQuery.size ? (
            <p>
              No open findings in this stage yet.{" "}
              <Link href="/security" className="font-semibold text-zk-accent hover:underline">
                Show all
              </Link>
            </p>
          ) : (
            <p>
              No open findings match these filters.{" "}
              <Link href="/security" className="font-semibold text-zk-accent hover:underline">
                Show all
              </Link>
            </p>
          )
        }
      />

      <SecurityFindingsCard
        headingId="disclosed-heading"
        title="Disclosed"
        findings={filteredDisclosed}
        kind="disclosed"
        filterHref={filterHref}
        footer={`Showing ${filteredDisclosed.length} of ${dashboard.disclosed.length} disclosed ${dashboard.disclosed.length === 1 ? "finding" : "findings"}`}
        empty={<p>Findings appear here after a workspace owner or admin publishes them.</p>}
      />


      <section aria-labelledby="severity-heading" className={orgCard}>
        <h2 id="severity-heading" className="text-base font-semibold text-zk-text">How to rate severity</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {SECURITY_SEVERITIES.map((level) => (
            <div key={level} className="space-y-1">
              <dt><SeverityChip severity={level} /></dt>
              <dd className="text-sm text-zk-text2">{SEVERITY_GUIDE[level]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {access.admin ? (
        <section aria-labelledby="agents-heading" className={orgCard}>
          <h2 id="agents-heading" className="text-base font-semibold text-zk-text">Agents cleared for security work</h2>
          <p className="mt-1 text-sm text-zk-text2">
            A cleared agent can read every private finding in this workspace, through the API and its files, so it can
            confirm, fix and test them. Only owners and admins see this list. An agent can always read findings its own
            owner reported.
          </p>
          {agents.length ? (
            <ul className="mt-3 divide-y divide-zk-border">
              {agents.map((agent) => (
                <li key={agent.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="font-semibold text-zk-text">{agent.name}</span>{" "}
                    <span className="text-zk-muted">
                      {agent.level} agent of {agent.owner?.name ?? "someone"}
                    </span>
                  </span>
                  <AgentClearanceToggle agentId={agent.id} agentName={agent.name} cleared={agent.securityCleared} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zk-text2">No agents in this workspace yet.</p>
          )}
        </section>
      ) : null}
      <section aria-labelledby="policy-heading" className={orgCard}>
        <h2 id="policy-heading" className="text-base font-semibold text-zk-text">Responsible disclosure</h2>
        <div className="mt-3">
          <ReadOnlyNote>
            Share sensitive evidence through the private report. A workspace owner or admin decides when to publish the finding.
          </ReadOnlyNote>
        </div>
      </section>
    </div>
  );
}

function securityFilterHref(severity: "all" | (typeof SECURITY_SEVERITIES)[number], stage: SecurityStageFilter, search?: URLSearchParams) {
  const params = new URLSearchParams(search);
  if (severity !== "all") params.set("severity", severity);
  if (stage !== "all") params.set("stage", stage);
  const query = params.toString();
  return query ? `/security?${query}` : "/security";
}

function Stat({ label, value, hint, alert = false }: { label: string; value: string; hint: string; alert?: boolean }) {
  return (
    <div className="min-w-0 p-4">
      <p className="text-sm font-medium text-zk-text2">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${alert ? "text-zk-bad-fg" : "text-zk-text"}`}>{value}</p>
      <p className="mt-1 text-xs text-zk-text2">{hint}</p>
    </div>
  );
}

const SEARCH_FIELD =
  "h-10 w-full rounded-full border border-zk-border bg-zk-surface px-4 text-sm text-zk-text placeholder:text-zk-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2 sm:w-56";

const FILTER_BUTTON =
  "inline-flex h-10 w-10 shrink-0 cursor-pointer list-none items-center justify-center rounded-full border border-zk-border bg-zk-surface text-zk-text2 hover:bg-zk-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden";

const REPORT_BUTTON =
  "inline-flex h-10 items-center gap-1.5 rounded-full bg-electric-blue-strong px-5 text-sm font-bold text-white hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2";

const REPORT_BUTTON_QUIET =
  "inline-flex h-10 items-center gap-1.5 rounded-full border border-zk-border bg-zk-surface px-4 text-sm font-bold text-zk-text hover:bg-zk-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2";

/** "Report a vulnerability": straight to the form in a one-project workspace, else pick the project. */
function ReportButton({ projects, variant = "primary" }: { projects: { name: string; ref: ProjectRef }[]; variant?: "primary" | "quiet" }) {
  if (projects.length === 0) return null;
  const tone = variant === "quiet" ? REPORT_BUTTON_QUIET : REPORT_BUTTON;
  const label = (
    <>
      {variant === "quiet" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ) : null}
      Report a vulnerability
    </>
  );
  if (projects.length === 1) {
    // A full page load, so the quick-report modal doesn't intercept it.
    return <a href={newIssuePath(projects[0].ref, "security=1")} className={tone}>{label}</a>;
  }
  return (
    <details className="security-report relative">
      <summary className={`${tone} cursor-pointer list-none`}>{label}</summary>
      <div className="absolute left-0 z-20 mt-2 w-64 sm:left-auto sm:right-0 rounded-2xl border border-zk-border bg-zk-surface p-2 shadow-lg">
        <p className="px-2 py-1 text-xs text-zk-muted">Which product is it in?</p>
        <ul>
          {projects.map((project) => (
            <li key={project.ref}>
              <a href={newIssuePath(project.ref, "security=1")} className="block rounded-xl px-2 py-1.5 text-sm text-zk-text hover:bg-zk-bg">
                {project.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}


