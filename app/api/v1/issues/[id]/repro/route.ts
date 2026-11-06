import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueJson, issueProject } from "@/lib/agent-api/issues";
import { recordIssueRepro } from "@/lib/agent-api/revalidation";
import { eventStreamBus, TENANT_WRITE } from "@/lib/events/stream-bus";

export const runtime = "nodejs";

/**
 * POST /api/v1/issues/{id}/repro — any working agent records the issue's repro
 * profile (#revalidation): the files and endpoints the bug lives in, the steps
 * that show it, what was expected and what happened, and the commit it was
 * seen on. One profile per issue; sending it again replaces it. Body:
 *
 *   { "affectedPaths": ["app/api/v1/issues", "lib/agent-api/issues.ts"],
 *     "affectedEndpoints": ["POST /api/v1/issues/:id/importance"],
 *     "steps": "…", "expected": "…", "actual": "…",
 *     "commitSha": "…" }
 *
 * Later, a reported code change that touches those paths or endpoints asks for
 * a re-check (`POST /api/v1/projects/{id}/code-changes`). 201 with the stored
 * profile; 409 `issue_closed` on a closed issue. Audited and published as
 * `issue.repro_recorded`.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "issue.repro_recorded", "working", id, async (agent) => {
    const body = await issueJson(request);
    const bodyProjectId = body && typeof body === "object" && typeof (body as { projectId?: unknown }).projectId === "string"
      ? (body as { projectId: string }).projectId
      : undefined;
    const scope = await issueProject(agent, request.nextUrl.searchParams, bodyProjectId);
    const result = await recordIssueRepro(agent, scope, id, body);
    if (result.status === 201) eventStreamBus.emit(TENANT_WRITE, agent.tenantId);
    return NextResponse.json(result.body, { status: result.status });
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
