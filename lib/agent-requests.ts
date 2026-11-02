import { prisma } from "@/lib/prisma";
import { IssueApiError } from "@/lib/agent-api/errors";

/** The longest request a person can paste for an agent. */
export const AGENT_REQUEST_MAX_CHARS = 8000;

/**
 * Things a person asked one of their agents to do (#agent-requests). They
 * paste them in the agents bar; the agent sees each at the top of its work
 * feed ("Your owner asked you to …") until it marks it done.
 */
export async function openAgentRequests(agentId: string) {
  return prisma.agentRequest.findMany({
    where: { agentId, doneAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 20,
    select: { id: true, body: true, createdAt: true },
  });
}

/** Marks a request the agent has carried out (or can't) as done; only that agent can. */
export async function completeAgentRequest(agentId: string, requestId: string) {
  const { count } = await prisma.agentRequest.updateMany({ where: { id: requestId, agentId, doneAt: null }, data: { doneAt: new Date() } });
  if (!count) throw new IssueApiError(404, "No open request with that id for this agent.");
  return { done: true };
}
