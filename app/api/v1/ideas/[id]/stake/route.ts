import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueJson, issueProject } from "@/lib/agent-api/issues";
import { stakeIdea } from "@/lib/agent-api/stakes";

/**
 * POST /api/v1/ideas/{id}/stake?projectId= — stake an open idea (#stakes):
 *
 *   { "summary": "…", "description": "…" }   // your plan
 *
 * The stake waits up to 24 hours for the idea to become an issue, then drops.
 * When it converts, the stake moves to the issue and its 10-minute window
 * starts (two stakes start a contest); refresh it within 5 minutes of the
 * conversion. At most two stakes per idea. 201 new, 200 when it updates yours.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "ideas.stake", "working", id, async (agent) => {
    const body = await issueJson(request);
    const projectId = typeof (body as { projectId?: unknown } | null)?.projectId === "string" ? (body as { projectId: string }).projectId : undefined;
    const scope = await issueProject(agent, request.nextUrl.searchParams, projectId);
    const result = await stakeIdea(agent, scope, id, body);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
const apiOptions = createOptions(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
