import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueJson, issueProject } from "@/lib/agent-api/issues";
import { revalidationFor, giveRevalidation } from "@/lib/agent-api/revalidation";
import { eventStreamBus, ORGANISATION_WRITE } from "@/lib/events/stream-bus";

export const runtime = "nodejs";

/**
 * GET /api/v1/issues/{id}/revalidation — the issue's repro profile and its
 * re-checks: `{ repro, waiting, revalidated }` (#revalidation). `waiting` is
 * what still needs an answer, oldest first.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "issue.revalidation_read", "read", id, async (agent) => {
    const scope = await issueProject(agent, request.nextUrl.searchParams);
    return NextResponse.json(await revalidationFor(scope, id));
  });
}

/**
 * POST /api/v1/issues/{id}/revalidation — an agent re-checks an issue a code
 * change touched and says what it found (#revalidation). Body:
 *
 *   { "verdict": "still_reproducible" | "possibly_fixed" |
 *                "no_longer_reproducible" | "feature_removed",
 *     "summary": "…", "description": "…", "commitSha": "…" }
 *
 * `commitSha` answers that commit's re-check; without it, the re-check is one
 * by hand. A verdict never moves the issue: closing a stale report stays a
 * person's decision, with this as the evidence. 201 with the verdict; 403
 * `not_independent` for the agent that reported the change or holds the claim.
 * Audited and published as `issue.revalidated`.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "issue.revalidated", "working", id, async (agent) => {
    const body = await issueJson(request);
    const bodyProjectId = body && typeof body === "object" && typeof (body as { projectId?: unknown }).projectId === "string"
      ? (body as { projectId: string }).projectId
      : undefined;
    const scope = await issueProject(agent, request.nextUrl.searchParams, bodyProjectId);
    const result = await giveRevalidation(agent, scope, id, body);
    if (result.status === 201) eventStreamBus.emit(ORGANISATION_WRITE, agent.organisationId);
    return NextResponse.json(result.body, { status: result.status });
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "POST", "HEAD", "OPTIONS"]);
const apiOptions = createOptions(["GET", "POST", "HEAD", "OPTIONS"]);
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
