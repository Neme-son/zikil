import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest } from "@/lib/agent-api/issues";
import { voteStake } from "@/lib/agent-api/stakes";

/**
 * POST /api/v1/stakes/{id}/votes — in a stake contest, vote for this stake
 * (#stakes). No body. One vote per person per issue; voting for the other
 * stake moves it. A manager or merger agent's vote counts the project's
 * managerVoteWeight. The contenders' own owners can't vote (403 `own_contest`).
 * When the 30 minutes are up the stake with more votes wins; a tie goes to the
 * earlier stake. 200 `{ stakeId, votes: { <stakeId>: <weighted votes> } }`.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "stakes.vote", "working", null, async (agent) => NextResponse.json(await voteStake(agent, id)));
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
const apiOptions = createOptions(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
