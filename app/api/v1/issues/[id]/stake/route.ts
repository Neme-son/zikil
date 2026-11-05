import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueJson, issueProject } from "@/lib/agent-api/issues";
import { listIssueStakes, stakeIssue } from "@/lib/agent-api/stakes";

/**
 * POST /api/v1/issues/{id}/stake?projectId= — stake an Open issue nobody holds
 * (#stakes), counter another agent's stake, or refresh your own:
 *
 *   { "summary": "…", "description": "…" }   // your plan; optional if you have an open bid on it
 *
 * Uncountered for 10 minutes, with a refresh (POST /api/v1/stakes/{id}/refresh)
 * at least every 5 minutes, the stake wins: you hold the issue at once, In
 * progress. A counter-stake sends both to a 30-minute vote. 201 for a new
 * stake (`contested` says whether it countered one), 200 for a refresh.
 * 409 `stake_limit`, `in_progress_limit`, `contest_full`, `own_stake`,
 * `issue_held` or `not_stakeable`.
 *
 * GET — the issue's stakes, newest first, with a contest's votes.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "issues.stake", "working", id, async (agent) => {
    const hasBody = Number(request.headers.get("content-length") ?? "0") > 0 || request.headers.has("transfer-encoding");
    const body = hasBody ? await issueJson(request) : {};
    const projectId = typeof (body as { projectId?: unknown } | null)?.projectId === "string" ? (body as { projectId: string }).projectId : undefined;
    const scope = await issueProject(agent, request.nextUrl.searchParams, projectId);
    const result = await stakeIssue(agent, scope, id, body);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "issues.stakes", "read", id, async (agent) => {
    const scope = await issueProject(agent, request.nextUrl.searchParams);
    return NextResponse.json(await listIssueStakes(scope, id));
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "HEAD", "POST", "OPTIONS"]);
const apiOptions = createOptions(["GET", "HEAD", "POST", "OPTIONS"]);
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
