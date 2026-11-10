import { Prisma, type AgentLevel, type WorkTrack } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { activeIn, activeLevels, levelIn } from "@/lib/agents/active-in";
import { parseIssueRef } from "@/lib/issue-ref";
import { workFeed, type FeedProject, type WorkItem } from "@/lib/agent-api/work";

export const ISSUE_PING_LIMIT = 3;
export const ISSUE_PING_RECENT_MS = 5 * 60_000;
export const ISSUE_PING_EVENT = "issue.ping";

const kindsByStage: Record<string, readonly WorkItem["kind"][]> = {
  requires_confirmation: ["confirm_issue", "open_issue"],
  open: ["ready_issue", "award_bid", "review_bid", "investigate_issue"],
  in_progress: ["active_claim", "deliver_stranded", "review_idle", "reclaim_issue", "report_pr_status"],
  requires_review: ["test_fix", "report_pr_status"],
  accepted: ["accept_fix", "report_pr_status"],
  ready_to_merge: ["merge_fix", "report_pr_status"],
  error: ["repair_pull_request", "report_pr_status", "reconcile_merged"],
  on_dev: ["report_deployment", "await_release"],
  on_staging: ["report_deployment", "await_release"],
  on_prod: ["report_deployment"],
};

const responseEvents: Record<string, readonly string[]> = {
  requires_confirmation: ["issue.confirmation", "issue.confirmed"],
  open: ["issue.bid", "issue.bid_awarded", "issue.bid_voted", "issue.staked"],
  in_progress: ["issue.delivered", "issue.pull_request_reported", "claim.accepted", "plan.submitted"],
  requires_review: ["issue.test_verdict", "issue.pull_request_reported"],
  accepted: ["issue.accepted", "issue.pull_request_reported"],
  ready_to_merge: ["issue.pull_request_reported", "issue.accepted"],
  error: ["issue.pull_request_reported", "issue.accepted"],
  on_dev: ["issue.updated"],
  on_staging: ["issue.updated"],
  on_prod: ["issue.updated"],
};

export type PingActor = { userId: string; agentId?: string | null; organisationId: string };
export type PingCandidate = { id: string; name: string; username: string; action: string; level: AgentLevel };
export type PingRecord = { id: string; agentId: string; agentName: string; stage: string; status: "sent" | "seen" | "acted"; createdAt: string };

export class IssuePingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function issueInScope(organisationId: string, issueRef: string, projectId?: string) {
  const ref = parseIssueRef(issueRef);
  const issue = await prisma.bug.findFirst({
    where: { organisationId, ...(projectId ? { projectId } : {}), isDeleted: false, ...(ref.kind === "number" ? { number: ref.number } : { id: ref.id }) },
    select: { id: true, number: true, title: true, substatus: true, track: true, organisationId: true, projectId: true,
      project: { select: { id: true, name: true, slug: true, organisation: { select: { slug: true } } } } },
  });
  if (!issue) throw new IssuePingError(404, "Issue not found in this project.");
  return issue;
}

async function ensureSender(actor: PingActor, projectId: string) {
  if (actor.agentId) return;
  const member = await prisma.membership.findUnique({ where: { organisationId_userId: { organisationId: actor.organisationId, userId: actor.userId } }, select: { id: true } });
  if (!member) throw new IssuePingError(403, "Join this organisation to ping its agents.");
  const project = await prisma.project.findFirst({ where: { id: projectId, organisationId: actor.organisationId }, select: { id: true } });
  if (!project) throw new IssuePingError(404, "Project not found.");
}

function feedProject(issue: Awaited<ReturnType<typeof issueInScope>>): FeedProject {
  return { id: issue.project.id, name: issue.project.name, slug: issue.project.slug, orgSlug: issue.project.organisation.slug };
}

async function candidateAction(issue: Awaited<ReturnType<typeof issueInScope>>, agent: {
  id: string; name: string; ownerUserId: string; activations: { organisationId: string; level: AgentLevel }[];
}): Promise<WorkItem | null> {
  const level = levelIn(agent, issue.organisationId);
  const feed = await workFeed({ agentId: agent.id, name: agent.name, ownerId: agent.ownerUserId, organisationId: issue.organisationId, level, burst: false, keyId: "ping-candidate" }, feedProject(issue), issue.track as WorkTrack);
  const allowed = kindsByStage[issue.substatus] ?? [];
  return feed.items.find((item) => item.issue?.id === issue.id && item.canAct && allowed.includes(item.kind) && item.actions.some((action) => action.method === "POST")) ?? null;
}

async function pingRows(issueId: string, stage: string) {
  return prisma.agentInboxItem.findMany({
    where: { bugId: issueId, eventType: ISSUE_PING_EVENT, payload: { path: ["stage"], equals: stage } },
    select: { id: true, agentId: true, readAt: true, createdAt: true, agent: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function listIssuePings(actor: PingActor, issueRef: string, projectId?: string) {
  const issue = await issueInScope(actor.organisationId, issueRef, projectId);
  await ensureSender(actor, issue.projectId);
  const existing = await pingRows(issue.id, issue.substatus);
  const recent = new Date(Date.now() - ISSUE_PING_RECENT_MS);
  const agents = await prisma.agent.findMany({
    where: { ...activeIn(issue.organisationId), revokedAt: null, pausedAt: null, apiKeys: { some: { organisationId: issue.organisationId, revokedAt: null, lastUsedAt: { gte: recent } } } },
    select: { id: true, name: true, username: true, ownerUserId: true, activations: activeLevels },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 30,
  });
  const alreadyPinged = new Set(existing.map((row) => row.agentId));
  const possible = agents.filter((agent) => !alreadyPinged.has(agent.id));
  const actions = await Promise.all(possible.map(async (agent) => {
    const item = await candidateAction(issue, agent).catch(() => null);
    return item ? { id: agent.id, name: agent.name, username: agent.username, level: levelIn(agent, issue.organisationId), action: item.title } : null;
  }));
  const events = existing.length ? await prisma.agentEvent.findMany({
    where: { bugId: issue.id, actorAgentId: { in: existing.map((row) => row.agentId) }, type: { in: [...(responseEvents[issue.substatus] ?? [])] }, createdAt: { gte: existing[0].createdAt } },
    select: { actorAgentId: true, createdAt: true },
  }) : [];
  const pings: PingRecord[] = existing.map((row) => ({
    id: row.id, agentId: row.agentId, agentName: row.agent.name, stage: issue.substatus,
    status: events.some((event) => event.actorAgentId === row.agentId && event.createdAt.getTime() >= row.createdAt.getTime()) ? "acted" : row.readAt ? "seen" : "sent",
    createdAt: row.createdAt.toISOString(),
  }));
  return { issueId: issue.id, stage: issue.substatus, limit: ISSUE_PING_LIMIT, remaining: Math.max(0, ISSUE_PING_LIMIT - existing.length), candidates: actions.filter((item): item is PingCandidate => item !== null), pings };
}

export async function sendIssuePings(actor: PingActor, issueRef: string, targetAgentIds: string[], projectId?: string) {
  if (!Array.isArray(targetAgentIds) || targetAgentIds.length < 1 || targetAgentIds.length > ISSUE_PING_LIMIT || targetAgentIds.some((id) => typeof id !== "string") || new Set(targetAgentIds).size !== targetAgentIds.length) {
    throw new IssuePingError(400, `Choose 1 to ${ISSUE_PING_LIMIT} different agents.`);
  }
  const view = await listIssuePings(actor, issueRef, projectId);
  if (targetAgentIds.length > view.remaining) throw new IssuePingError(409, `Only ${view.remaining} pings remain for this step.`);
  const allowed = new Map(view.candidates.map((agent) => [agent.id, agent]));
  if (targetAgentIds.some((id) => !allowed.has(id))) throw new IssuePingError(409, "An agent is unavailable or cannot act on this step. Refresh the list.");
  const issue = await issueInScope(actor.organisationId, issueRef, projectId);
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.bug.findUnique({ where: { id: issue.id }, select: { substatus: true, isDeleted: true } });
      if (!current || current.isDeleted || current.substatus !== view.stage) throw new IssuePingError(409, "This issue moved to another step. Refresh and try again.");
      const used = await tx.agentInboxItem.count({ where: { bugId: issue.id, eventType: ISSUE_PING_EVENT, payload: { path: ["stage"], equals: view.stage } } });
      if (used + targetAgentIds.length > ISSUE_PING_LIMIT) throw new IssuePingError(409, `Only ${Math.max(0, ISSUE_PING_LIMIT - used)} pings remain for this step.`);
      const prior = await tx.agentInboxItem.findMany({ where: { bugId: issue.id, eventType: ISSUE_PING_EVENT, agentId: { in: targetAgentIds }, payload: { path: ["stage"], equals: view.stage } }, select: { agentId: true } });
      if (prior.length) throw new IssuePingError(409, "One of these agents was already pinged for this step.");
      for (const id of targetAgentIds) {
        const target = allowed.get(id)!;
        await tx.agentInboxItem.create({ data: { agentId: id, kind: "ping", eventType: ISSUE_PING_EVENT, bugId: issue.id,
          payload: { stage: view.stage, issueNumber: issue.number, issueTitle: issue.title, projectId: issue.projectId, fromUserId: actor.userId, fromAgentId: actor.agentId ?? null, request: target.action, message: "Please check this issue and take the action if your independent judgement supports it. A ping is not a decision." } } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof IssuePingError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new IssuePingError(409, "Another ping was sent at the same time. Refresh and try again.");
    throw error;
  }
  return { sent: targetAgentIds.length };
}
