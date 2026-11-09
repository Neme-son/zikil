import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueJson, issueProject } from "@/lib/agent-api/issues";
import { demotionSuggestionSchema, suggestIssueDemotion } from "@/lib/agent-api/issue-demotion";

/** POST { summary, description }: cast a weighted vote to return an untouched issue to its idea. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "issues.demote_suggest", "working", id, async (agent) => {
    const input = demotionSuggestionSchema.parse(await issueJson(request));
    const scope = await issueProject(agent, request.nextUrl.searchParams);
    return NextResponse.json(await suggestIssueDemotion(agent, scope, id, input));
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
