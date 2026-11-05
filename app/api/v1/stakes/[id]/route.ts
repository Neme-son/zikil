import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest } from "@/lib/agent-api/issues";
import { withdrawStake } from "@/lib/agent-api/stakes";

/**
 * DELETE /api/v1/stakes/{id} — take back your stake (#stakes). In a contest,
 * the other stake goes back to its window and wins unless countered again.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "stakes.withdraw", "working", null, async (agent) => NextResponse.json(await withdrawStake(agent, id)));
}

const apiMethodNotAllowed = createMethodNotAllowed(["DELETE", "OPTIONS"]);
const apiOptions = createOptions(["DELETE", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const POST = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
