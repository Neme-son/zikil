import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AgentContext } from "@/lib/agents/require-agent";
import { requireLevel } from "@/lib/agents/levels";
import { audit } from "@/lib/agents/audit";
import { IssueApiError } from "@/lib/agent-api/errors";
import { entryDescription, entrySummary } from "@/lib/agent-api/entry-fields";
import { isThresholdOnly, thresholdDecision, voteWeight } from "@/lib/governance";
import { publish } from "@/lib/agent-api/events";
import { readConfirmations } from "@/lib/issue-stage";
import { prisma } from "@/lib/prisma";
import { workflowFor } from "@/lib/workflow";
import { parseIssueRef, resolveIssueRef } from "@/lib/issue-ref";

type Db = PrismaClient | Prisma.TransactionClient;
type Scope = { organisationId: string; projectId: string };

export const demotionSuggestionSchema = z.object({ summary: entrySummary, description: entryDescription }).strict();
export const demotionSchema = demotionSuggestionSchema;

async function issueInProject(scope: Scope, issueRef: string) {
  const resolved = await resolveIssueRef(prisma, parseIssueRef(issueRef), { organisationId: scope.organisationId });
  const bug = resolved && await prisma.bug.findFirst({
    where: { id: resolved.id, organisationId: scope.organisationId, projectId: scope.projectId, isDeleted: false },
    select: { id: true, number: true, title: true },
  });
  if (!bug) throw new IssueApiError(404, "Issue not found in this project.");
  return bug;
}

async function lockedIssue(tx: Prisma.TransactionClient, bugId: string, scope: Scope) {
  await tx.$queryRaw`SELECT "id" FROM "Bug" WHERE "id" = ${bugId} FOR UPDATE`;
  const bug = await tx.bug.findFirst({
    where: { id: bugId, ...scope, isDeleted: false },
    select: {
      id: true, number: true, title: true, status: true, substatus: true,
      pullRequestUrl: true, idea: { select: { id: true, number: true, status: true, issueId: true } },
    },
  });
  if (!bug) throw new IssueApiError(404, "Issue not found in this project.");
  if (bug.status !== "open" || bug.substatus !== "requires_confirmation") refuse("Only an Open issue that still requires confirmation can be demoted.");
  if (!bug.idea || bug.idea.status !== "converted" || bug.idea.issueId !== bug.id) refuse("This issue has no openable original idea to return to.");
  if (bug.pullRequestUrl) refuse("This issue already has a linked pull request.");
  const [confirmations, bids, claims, pullRequestReports] = await Promise.all([
    readConfirmations(tx, { id: bug.id }),
    tx.issueBid.count({ where: { bugId: bug.id } }),
    tx.issueClaim.count({ where: { bugId: bug.id } }),
    tx.pullRequestReport.count({ where: { bugId: bug.id } }),
  ]);
  const confirmationState = confirmations.get(bug.id);
  if (confirmationState?.counted.length) refuse("This issue already has counted confirmations.");
  if (bids) refuse("This issue already has a bid history.");
  if (claims) refuse("This issue already has a claim history.");
  if (pullRequestReports) refuse("This issue already has a pull request report.");
  return { ...bug, idea: bug.idea };
}

function refuse(message: string): never {
  throw new IssueApiError(409, message, { error: "not_demotable", message });
}

async function tally(tx: Db, bugId: string): Promise<number> {
  const rows = await tx.issueDemotionSuggestion.findMany({
    where: { bugId },
    select: { votes: true },
  });
  return rows.reduce((sum, row) => sum + row.votes, 0);
}

async function demoteLocked(
  tx: Prisma.TransactionClient,
  scope: Scope,
  bug: Awaited<ReturnType<typeof lockedIssue>>,
  actor: AgentContext,
  input: z.infer<typeof demotionSchema>,
  votes: number,
  threshold: number,
  viaThreshold: boolean,
) {
  const at = new Date();
  await tx.idea.update({
    where: { id: bug.idea.id },
    data: {
      status: "open", issueId: null, convertedAt: null, convertedByAgentId: null,
      demotedAt: at, demotedByAgentId: actor.agentId,
      demotionSummary: input.summary, demotionDescription: input.description,
    },
  });
  await tx.bug.update({ where: { id: bug.id }, data: { isDeleted: true, deletedAt: at, demotedToIdeaId: bug.idea.id } });
  const decision = viaThreshold ? thresholdDecision({ userId: actor.ownerId, agentId: actor.agentId }, votes, threshold) : null;
  await publish(tx, {
    organisationId: scope.organisationId,
    type: "issue.demoted",
    actorAgentId: actor.agentId,
    bugId: bug.id,
    projectId: scope.projectId,
    payload: {
      issueId: bug.id, issueNumber: bug.number, ideaId: bug.idea.id, ideaNumber: bug.idea.number,
      summary: input.summary, votes, threshold, ...(decision ?? {}),
    },
  });
  return { issueId: bug.id, issueNumber: bug.number, ideaId: bug.idea.id, ideaNumber: bug.idea.number, demotedAt: at.toISOString(), votes, threshold };
}

/** A weighted vote to return an untouched converted issue to its original idea. */
export async function suggestIssueDemotion(agent: AgentContext, scope: Scope, issueRef: string, input: z.infer<typeof demotionSuggestionSchema>) {
  requireLevel(agent, "working");
  const initial = await issueInProject(scope, issueRef);
  const workflow = await workflowFor(scope.projectId);
  const threshold = workflow.closeThreshold;
  const weight = voteWeight(agent.level, workflow.managerVoteWeight);
  const result = await prisma.$transaction(async (tx) => {
    const bug = await lockedIssue(tx, initial.id, scope);
    const previous = await tx.issueDemotionSuggestion.findUnique({ where: { bugId_onBehalfOfUserId: { bugId: bug.id, onBehalfOfUserId: agent.ownerId } }, select: { votes: true } });
    await tx.issueDemotionSuggestion.upsert({
      where: { bugId_onBehalfOfUserId: { bugId: bug.id, onBehalfOfUserId: agent.ownerId } },
      update: { agentId: agent.agentId, summary: input.summary, description: input.description, votes: Math.max(previous?.votes ?? 0, weight) },
      create: { bugId: bug.id, onBehalfOfUserId: agent.ownerId, agentId: agent.agentId, summary: input.summary, description: input.description, votes: weight },
    });
    const votes = await tally(tx, bug.id);
    await publish(tx, {
      organisationId: scope.organisationId, type: "issue.demotion_suggested", actorAgentId: agent.agentId,
      bugId: bug.id, projectId: scope.projectId,
      payload: { issueId: bug.id, issueNumber: bug.number, votes, threshold },
    });
    if (votes >= threshold && isThresholdOnly(workflow)) {
      return demoteLocked(tx, scope, bug, agent, input, votes, threshold, true);
    }
    return { issueId: bug.id, issueNumber: bug.number, votes, threshold, queued: votes >= threshold, demoted: false };
  });
  await audit(agent, "issue.demotion_suggested", `issue:${initial.id}`, { votes: result.votes, threshold: result.threshold, demoted: "demotedAt" in result }, { bugId: initial.id });
  if ("ideaId" in result) await audit(agent, "issue.demoted", `issue:${initial.id}`, { ideaId: result.ideaId, votes: result.votes, threshold: result.threshold }, { bugId: initial.id });
  return result;
}

/** A manager may demote directly; other agents need the weighted threshold. */
export async function demoteIssue(agent: AgentContext, scope: Scope, issueRef: string, input: z.infer<typeof demotionSchema>) {
  requireLevel(agent, "manager");
  const initial = await issueInProject(scope, issueRef);
  const threshold = (await workflowFor(scope.projectId)).closeThreshold;
  const result = await prisma.$transaction(async (tx) => {
    const bug = await lockedIssue(tx, initial.id, scope);
    const votes = await tally(tx, bug.id);
    return demoteLocked(tx, scope, bug, agent, input, votes, threshold, false);
  });
  await audit(agent, "issue.demoted", `issue:${initial.id}`, { ideaId: result.ideaId, votes: result.votes, threshold: result.threshold }, { bugId: initial.id });
  return result;
}
