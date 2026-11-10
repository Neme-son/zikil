import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { agentIssueRequest, issueJson, issueProject } from "@/lib/agent-api/issues";
import { IssuePingError, listIssuePings, sendIssuePings } from "@/lib/agent-api/issue-pings";
import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";

export const runtime = "nodejs";
const bodySchema = z.object({ agentIds: z.array(z.string().min(1)).min(1).max(3), projectId: z.string().min(1).optional() }).strict();

function errorResponse(error: unknown) {
  if (error instanceof IssuePingError) return NextResponse.json({ error: "ping_unavailable", message: error.message }, { status: error.status });
  throw error;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "issue.pings.read", "read", id, async (agent) => {
    try {
      const scope = await issueProject(agent, request.nextUrl.searchParams);
      return NextResponse.json(await listIssuePings({ userId: agent.ownerId, agentId: agent.agentId, organisationId: agent.organisationId }, id, scope.projectId));
    } catch (error) { return errorResponse(error); }
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "issue.pings.send", "working", id, async (agent) => {
    const parsed = bodySchema.safeParse(await issueJson(request));
    if (!parsed.success) return NextResponse.json({ error: "invalid_body", message: "Send 1 to 3 agentIds and, if needed, projectId." }, { status: 400 });
    try {
      const scope = await issueProject(agent, request.nextUrl.searchParams, parsed.data.projectId);
      return NextResponse.json(await sendIssuePings({ userId: agent.ownerId, agentId: agent.agentId, organisationId: agent.organisationId }, id, parsed.data.agentIds, scope.projectId));
    } catch (error) { return errorResponse(error); }
  });
}

const methodNotAllowed = createMethodNotAllowed(["GET", "POST", "OPTIONS"]);
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = createOptions(["GET", "POST", "OPTIONS"]);
