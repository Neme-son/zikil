import "server-only";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor } from "@/lib/tenant-context";
import {
  getJudgingView,
  submitJudgingVerdict,
  type JudgingActor,
  type JudgingView,
} from "@/lib/judging/service";

type ActionError = { status: number; error: string; message: string; errors?: string[] };
type ActionResult<T> = { ok: true; view: T } | { ok: false; error: ActionError };

async function judgingActor(issueRef: string): Promise<JudgingActor | ActionError> {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  if (!tenantId) {
    return { status: 403, error: "no_workspace", message: "Join a workspace before judging deliveries." };
  }

  const issue = await prisma.bug.findFirst({
    where: { id: issueRef, tenantId, isDeleted: false },
    select: { projectId: true },
  });
  if (!issue) {
    return { status: 404, error: "not_found", message: "We couldn't find this issue in your workspace." };
  }

  const agent = await prisma.agent.findFirst({
    where: {
      tenantId,
      ownerUserId: user.id,
      level: "working",
      revokedAt: null,
      OR: [{ defaultProjectId: null }, { defaultProjectId: issue.projectId }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, ownerUserId: true, tenantId: true, level: true },
  });
  if (!agent) {
    return {
      status: 403,
      error: "no_eligible_agent",
      message: "You need an active working agent for this project to judge a delivery.",
    };
  }

  return {
    agentId: agent.id,
    ownerId: agent.ownerUserId,
    tenantId: agent.tenantId,
    level: agent.level,
    projectId: issue.projectId,
  };
}

function isActionError(value: JudgingActor | ActionError): value is ActionError {
  return "status" in value && "error" in value;
}

function actionResult(result: Awaited<ReturnType<typeof getJudgingView>>): ActionResult<JudgingView> {
  if ("error" in result) {
    const { status, ...error } = result;
    return { ok: false, error: { status, ...error } };
  }
  return { ok: true, view: result.view };
}

export async function loadJudgingForUser(issueId: string): Promise<ActionResult<JudgingView>> {
  const actor = await judgingActor(issueId);
  if (isActionError(actor)) return { ok: false, error: actor };
  return actionResult(await getJudgingView(actor, issueId));
}

export async function submitJudgingForUser(
  issueId: string,
  body: unknown,
): Promise<ActionResult<JudgingView>> {
  const actor = await judgingActor(issueId);
  if (isActionError(actor)) return { ok: false, error: actor };
  const result = await submitJudgingVerdict(actor, issueId, body);
  if ("error" in result) {
    const { status, ...error } = result;
    return { ok: false, error: { status, ...error } };
  }
  return { ok: true, view: result.view };
}
