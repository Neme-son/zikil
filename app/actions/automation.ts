"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { bugInOrganisation, currentOrganisationIdFor } from "@/lib/organisation-context";
import { currentOrganisationAccess } from "@/lib/organisation-access";
import { revalidateIssue } from "@/lib/revalidate-issue";
import { validateAutomationRule } from "@/lib/automation";

export type AutomationActionResult = { ok?: true; error?: string; ruleId?: string };

async function requireOrgAdmin() {
  const user = await requireUser();
  const access = await currentOrganisationAccess(user.id, user.role);
  if (!access.admin) return { error: "Only an owner or admin can manage automation rules." };
  return { user };
}

function revalidate() {
  revalidateIssue();
  revalidatePath("/[project]", "layout");
}

/** Create a new automation rule. */
export async function createAutomationRuleAction(
  projectId: string,
  input: { name: string; trigger: string; conditions: unknown[]; actions: unknown[]; enabled: boolean },
): Promise<AutomationActionResult> {
  const gate = await requireOrgAdmin();
  if ("error" in gate) return { error: gate.error };
  const organisationId = await currentOrganisationIdFor(gate.user.id);
  if (!organisationId) return { error: "Select an organization first." };

  const project = await prisma.project.findFirst({
    where: { id: projectId, organisationId },
    select: { id: true },
  });
  if (!project) return { error: "That project doesn't exist." };

  const validated = validateAutomationRule({
    name: input.name,
    trigger: input.trigger,
    conditions: input.conditions,
    actions: input.actions,
    enabled: input.enabled,
  });
  if (!validated.ok) return { error: validated.error };

  const last = await prisma.automationRule.findFirst({
    where: { projectId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  try {
    const rule = await prisma.automationRule.create({
      data: {
        projectId,
        name: validated.rule.name,
        enabled: validated.rule.enabled,
        trigger: validated.rule.trigger,
        conditions: validated.rule.conditions,
        actions: validated.rule.actions,
        position: (last?.position ?? -1) + 1,
      },
      select: { id: true },
    });
    return { ok: true, ruleId: rule.id };
  } catch (error) {
    console.error("Failed to create automation rule:", error);
    return { error: "Failed to create the rule." };
  }
}

/** Toggle a rule's enabled state. */
export async function toggleAutomationRuleAction(ruleId: string, enabled: boolean): Promise<AutomationActionResult> {
  const gate = await requireOrgAdmin();
  if ("error" in gate) return { error: gate.error };
  const organisationId = await currentOrganisationIdFor(gate.user.id);
  if (!organisationId) return { error: "Select an organization first." };

  const rule = await prisma.automationRule.findFirst({
    where: { id: ruleId, project: { organisationId } },
    select: { id: true },
  });
  if (!rule) return { error: "That rule doesn't exist." };

  await prisma.automationRule.update({
    where: { id: rule.id },
    data: { enabled },
  });
  revalidate();
  return { ok: true };
}

/** Delete an automation rule. */
export async function deleteAutomationRuleAction(ruleId: string): Promise<AutomationActionResult> {
  const gate = await requireOrgAdmin();
  if ("error" in gate) return { error: gate.error };
  const organisationId = await currentOrganisationIdFor(gate.user.id);
  if (!organisationId) return { error: "Select an organization first." };

  const rule = await prisma.automationRule.findFirst({
    where: { id: ruleId, project: { organisationId } },
    select: { id: true },
  });
  if (!rule) return { ok: true };

  await prisma.automationRule.delete({ where: { id: rule.id } });
  revalidate();
  return { ok: true };
}

/**
 * Evaluate and execute automation rules for an issue event.
 * Called after an issue is created or updated.
 */
export async function evaluateAutomationRules(
  projectId: string,
  bugId: string,
  trigger: string,
  current: Record<string, unknown>,
  previous: Record<string, unknown> | null,
): Promise<void> {
  try {
    const rules = await prisma.automationRule.findMany({
      where: { projectId, enabled: true },
      orderBy: { position: "asc" },
    });

    for (const rule of rules) {
      if (rule.trigger !== trigger && rule.trigger !== "issue_updated") continue;

      const conditions = (rule.conditions as unknown as import("@/lib/automation").AutomationCondition[]) ?? [];
      const actions = (rule.actions as unknown as import("@/lib/automation").AutomationAction[]) ?? [];

      const { allConditionsMatch } = await import("@/lib/automation");
      if (!allConditionsMatch(conditions, current, previous)) continue;

      // Execute actions.
      let result = "success";
      let details = "";
      try {
        for (const action of actions) {
          switch (action.type) {
            case "set_priority":
              if (action.value) {
                await prisma.bug.update({ where: { id: bugId }, data: { priority: action.value } });
              }
              break;
            case "set_status": {
              const { moveTo, ENTRY_SUBSTATUS } = await import("@/lib/issue-substatus");
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const track = (current.track as any) ?? "product";
              const substatus = ENTRY_SUBSTATUS[action.value as keyof typeof ENTRY_SUBSTATUS];
              const move = substatus ? moveTo(substatus) : {};
              await prisma.bug.update({ where: { id: bugId }, data: move });
              break;
            }
            case "set_assignee":
              await prisma.bug.update({
                where: { id: bugId },
                data: { assigneeId: action.value === "" ? null : action.value },
              });
              break;
            case "add_comment":
              if (action.value) {
                await prisma.bugActivity.create({
                  data: {
                    bugId,
                    actorId: (current.reporterId as string) ?? (current.userId as string),
                    type: "commented",
                    summary: action.value,
                    metadata: { field: "automation", ruleId: rule.id },
                  },
                });
              }
              break;
          }
        }
      } catch (err) {
        result = "failure";
        details = String(err);
        console.error(`Automation rule ${rule.id} failed:`, err);
      }

      await prisma.automationLog.create({
        data: { ruleId: rule.id, bugId, result, details: details || null },
      });
    }
  } catch (error) {
    console.error("Automation evaluation failed:", error);
  }
}
