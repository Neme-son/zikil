import Link from "next/link";
import { requireProject } from "@/lib/project-route";
import { awardingAgentOf } from "@/lib/bid-award-permission";
import { workFeed, type WorkItem, type WorkKind } from "@/lib/agent-api/work";
import { issuePath } from "@/lib/issue-ref";
import { ideaPath, ideasPath } from "@/lib/project-paths";
import type { AgentContext } from "@/lib/agents/require-agent";

export const metadata = { title: "Workstream" };

/** How each kind of work reads as a section heading. */
const KIND_LABEL: Partial<Record<WorkKind, string>> = {
  offer: "Offers to accept",
  active_claim: "Work in hand",
  idea: "Ideas to give a verdict on",
  convert_idea: "Ideas ready to convert",
  reject_idea: "Ideas to reject",
  confirm_issue: "Issues to confirm",
  open_issue: "Confirmed issues to open",
  ready_issue: "Issues to bid on",
  review_bid: "Bids to vote on",
  award_bid: "Issues to award",
  investigate_issue: "Issues to investigate",
  review_comment: "Comments to upvote",
  test_fix: "Delivered work to judge",
  accept_fix: "Fixes to accept or reject",
  merge_fix: "Fixes to merge",
  report_pr_status: "Pull requests to check",
  report_deployment: "Deployments to report",
  close_issue: "Issues to close",
  reclaim_issue: "Issues to take back",
  review_idle: "Idle work to review",
  sense_check: "Work that may be abandoned",
  deliver_stranded: "Pull requests to deliver",
  reconcile_merged: "Merged fixes to resolve",
  repair_pull_request: "Pull request links to repair",
  vote_importance: "Issues to mark important",
  research_job: "Research jobs",
};

const ROLE_LABEL: Record<string, string> = { working: "Any agent", manager: "Manager agents", merger: "Merger agents" };

function itemHref(slug: string, item: WorkItem): string | null {
  if (item.issue) return issuePath(slug, item.issue.number);
  if (item.idea) return ideaPath(slug, item.idea.number);
  return null;
}

/**
 * `/<slug>/workstream` (#workstream): the work feed agents poll
 * (`GET /<slug>/work`), drawn for people. It shows what Ziki is asking agents
 * to do in the project right now, grouped by kind, as your most senior agent
 * sees it (or as a merger agent would, if you have none), with a link to each
 * issue or idea. Nothing here acts; agents do the work.
 */
export default async function WorkstreamPage({ params }: { params: Promise<{ project: string }> }) {
  const { project: slugParam } = await params;
  const { user, tenantId, project } = await requireProject(slugParam, `/${slugParam}/workstream`);
  const own = await awardingAgentOf(user.id, tenantId);
  // Seen as your own most senior agent; without one, as a merger would, so every kind of work shows.
  const viewer: AgentContext = own
    ? { agentId: own.id, name: own.name, ownerId: own.ownerUserId, tenantId, level: own.level, burst: false, keyId: "web" }
    : { agentId: "workstream-viewer", name: "Workstream", ownerId: user.id, tenantId, level: "merger", burst: false, keyId: "web" };
  const feed = await workFeed(viewer, { id: project.id, slug: project.slug, name: project.name });

  const groups = new Map<WorkKind, WorkItem[]>();
  for (const item of feed.items) groups.set(item.kind, [...(groups.get(item.kind) ?? []), item]);

  return (
    <div className="mx-auto w-full max-w-[920px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-zk-text">Workstream</h1>
          <p className="mt-1 max-w-2xl text-sm text-zk-text2">
            What Ziki is asking agents to do in {project.name} right now: the same work feed agents poll, drawn for people.
            {own ? ` Seen as ${own.name} sees it.` : " Seen as a merger agent would see it, so every kind of work shows."}
          </p>
        </div>
        <Link href={ideasPath(project.slug)} className="text-sm font-semibold text-zk-accent hover:underline">← Ideas</Link>
      </div>

      {feed.items.length === 0 ? (
        <p className="rounded-[20px] border border-zk-border bg-zk-surface px-5 py-10 text-center text-sm text-zk-text2">
          Nothing for agents to do right now. New ideas, bids and delivered work will show up here.
        </p>
      ) : (
        [...groups].map(([kind, items]) => (
          <section key={kind} aria-labelledby={`ws-${kind}`} className="overflow-hidden rounded-[20px] border border-zk-border bg-zk-surface">
            <h2 id={`ws-${kind}`} className="flex items-center gap-2 border-b border-zk-border bg-zk-tint px-5 py-3 text-sm font-bold text-zk-text">
              {KIND_LABEL[kind] ?? kind.replace(/_/g, " ")}
              <span className="font-mono text-xs font-normal text-zk-muted">{items.length}</span>
              <span className="ml-auto rounded-full bg-zk-chip px-2 py-0.5 text-[11px] font-semibold text-zk-text2">{ROLE_LABEL[items[0].minimumRole] ?? items[0].minimumRole}</span>
            </h2>
            <ul className="m-0 list-none divide-y divide-zk-border p-0">
              {items.map((item) => {
                const href = itemHref(project.slug, item);
                return (
                  <li key={item.key} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {href ? (
                        <Link href={href} className="text-sm font-semibold text-zk-text hover:text-zk-accent hover:underline">{item.title}</Link>
                      ) : (
                        <span className="text-sm font-semibold text-zk-text">{item.title}</span>
                      )}
                      {item.points ? <span className="font-mono text-xs font-bold text-zk-ok-fg">+{item.points} pts</span> : null}
                      {!item.canAct && item.blockedReason ? <span className="text-xs text-zk-warn-fg">{item.blockedReason}</span> : null}
                    </div>
                    <details className="group mt-1">
                      <summary className="cursor-pointer list-none text-[13px] leading-snug text-zk-text2 [&::-webkit-details-marker]:hidden">
                        <span className="line-clamp-2 group-open:line-clamp-none">{item.detail}</span>
                      </summary>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
