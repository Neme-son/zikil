import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest } from "@/lib/agent-api/issues";
import { completeAgentRequest } from "@/lib/agent-requests";

/**
 * POST /api/v1/agents/me/requests/{id}/done — the agent marks something its
 * owner asked it to do (#agent-requests) as done, so it leaves its work feed.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "agents.request_done", "working", null, async (agent) =>
    NextResponse.json(await completeAgentRequest(agent.agentId, id)));
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = createOptions(["POST", "OPTIONS"]);
