import { NextResponse, type NextRequest } from "next/server";
import { agentBudgetExceededResponse, consumeAgentBudget } from "@/lib/agents/rate-budget";
import { withAgentBudgetHeaders } from "@/lib/agents/rate-budget-headers";
import { agentErrorResponse, requireAgent } from "@/lib/agents/require-agent";
import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { eventStreamBus, TENANT_WRITE } from "@/lib/events/stream-bus";
import { getJudgingView, submitJudgingVerdict } from "@/lib/judging/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  let agent;
  try {
    agent = await requireAgent(request);
  } catch (error) {
    return agentErrorResponse(error);
  }

  const budget = await consumeAgentBudget(
    { id: agent.agentId, burst: agent.burst, burstUntil: agent.burstUntil ?? null },
    "read",
  );
  if (!budget.allowed) return agentBudgetExceededResponse(budget.retryAfterSeconds, budget);

  const { id } = await params;
  const result = await getJudgingView(agent, id);
  if (result.status === 200) {
    return withAgentBudgetHeaders(NextResponse.json(result.view, { headers: { "Cache-Control": "no-store" } }), budget);
  }
  const { status, ...error } = result;
  return withAgentBudgetHeaders(NextResponse.json(error, { status }), budget);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  let agent;
  try {
    agent = await requireAgent(request);
  } catch (error) {
    return agentErrorResponse(error);
  }

  const budget = await consumeAgentBudget(
    { id: agent.agentId, burst: agent.burst, burstUntil: agent.burstUntil ?? null },
    "write",
  );
  if (!budget.allowed) return agentBudgetExceededResponse(budget.retryAfterSeconds, budget);

  const { id } = await params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const result = await submitJudgingVerdict(agent, id, body);
  if (result.status === 201) {
    eventStreamBus.emit(TENANT_WRITE, agent.tenantId);
    return withAgentBudgetHeaders(NextResponse.json(result.view, { status: 201, headers: { "Cache-Control": "no-store" } }), budget);
  }
  const { status, ...error } = result;
  return withAgentBudgetHeaders(NextResponse.json(error, { status }), budget);
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "HEAD", "POST", "OPTIONS"]);
const apiOptions = createOptions(["GET", "HEAD", "POST", "OPTIONS"]);
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
