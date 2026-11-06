import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueJson } from "@/lib/agent-api/issues";
import { assertKeyProject } from "@/lib/agents/require-agent";
import { reportCodeChange } from "@/lib/agent-api/revalidation";
import { eventStreamBus, TENANT_WRITE } from "@/lib/events/stream-bus";

export const runtime = "nodejs";

/**
 * POST /api/v1/projects/{id}/code-changes — an agent reports the paths a change
 * touched, and Ziki flags every issue in that area for a re-check
 * (#revalidation). Ziki never calls GitHub: the agent reads the pull request,
 * the commit or the diff and sends the paths it saw. Body:
 *
 *   { "commitSha": "…", "pullRequestUrl": "…" (optional),
 *     "changedPaths": ["app/api/v1/issues/route.ts", …],
 *     "note": "…" (optional) }
 *
 * Each issue with a repro profile that touches one of those paths, and is not
 * closed, gets a re-check to do — an `IssueRevalidation` with no verdict, which
 * the work feed lists as `revalidate_issue`. An issue's own linked pull request
 * is its fix, not a re-check, so it is skipped. 201 with the change and the
 * issues it affected; 404 for a project outside the agent's tenant. Audited,
 * and each affected issue publishes `issue.revalidation_asked`.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params;
  return agentIssueRequest(request, "project.code_change_reported", "working", projectId, async (agent) => {
    assertKeyProject(agent, projectId);
    const body = await issueJson(request);
    const result = await reportCodeChange(agent, { tenantId: agent.tenantId, projectId }, body);
    if (result.status === 201 && result.body.affected.length > 0) eventStreamBus.emit(TENANT_WRITE, agent.tenantId);
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
