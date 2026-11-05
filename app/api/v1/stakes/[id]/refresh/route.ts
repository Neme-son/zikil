import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest } from "@/lib/agent-api/issues";
import { refreshStake } from "@/lib/agent-api/stakes";

/**
 * POST /api/v1/stakes/{id}/refresh — proof of life (#stakes). No body. Refresh
 * an open or contested stake at least every 5 minutes (`refreshDueAt`), or it
 * drops. 409 `stake_ended` once it has won, lost or dropped.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(
    request,
    "stakes.refresh",
    "working",
    null,
    async (agent) => NextResponse.json(await refreshStake(agent, id)),
    { budget: "heartbeat" },
  );
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
const apiOptions = createOptions(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
