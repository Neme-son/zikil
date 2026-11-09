/**
 * Automation rules (#automation-rules): project admins define rules that fire
 * automatically when issue events occur. Each rule has a trigger, a list of
 * conditions (all must match) and a list of actions (all are executed).
 */

export type AutomationCondition = {
  field: string; // status, priority, assigneeId, typeId, areaId, milestoneId, title
  operator: "equals" | "not_equals" | "changed" | "contains";
  value?: string;
};

export type AutomationAction = {
  type: "set_priority" | "set_status" | "set_assignee" | "add_comment";
  value?: string;
};

export type AutomationRuleInput = {
  name: string;
  enabled: boolean;
  trigger: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
};

export const AUTOMATION_TRIGGERS = [
  "issue_created",
  "issue_updated",
  "status_changed",
  "priority_changed",
  "assignee_changed",
] as const;

export const AUTOMATION_CONDITION_OPERATORS = ["equals", "not_equals", "changed", "contains"] as const;

export const AUTOMATION_ACTION_TYPES = ["set_priority", "set_status", "set_assignee", "add_comment"] as const;

export const AUTOMATION_CONDITION_FIELDS = [
  "status",
  "priority",
  "assigneeId",
  "typeId",
  "areaId",
  "milestoneId",
  "title",
] as const;

/** Validate a rule definition from the admin form. */
export function validateAutomationRule(input: {
  name: unknown;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
  enabled: unknown;
}): { ok: true; rule: AutomationRuleInput } | { ok: false; error: string } {
  if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.trim().length > 100) {
    return { ok: false, error: "Rule name must be 1 to 100 characters." };
  }
  if (typeof input.trigger !== "string" || !(AUTOMATION_TRIGGERS as readonly string[]).includes(input.trigger)) {
    return { ok: false, error: "Choose a valid trigger." };
  }
  if (!Array.isArray(input.conditions)) {
    return { ok: false, error: "Conditions must be an array." };
  }
  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    return { ok: false, error: "A rule needs at least one action." };
  }
  const conditions: AutomationCondition[] = [];
  for (const c of input.conditions) {
    if (typeof c !== "object" || c === null) return { ok: false, error: "Invalid condition." };
    const cond = c as Record<string, unknown>;
    if (typeof cond.field !== "string" || !(AUTOMATION_CONDITION_FIELDS as readonly string[]).includes(cond.field)) {
      return { ok: false, error: "Invalid condition field." };
    }
    if (typeof cond.operator !== "string" || !(AUTOMATION_CONDITION_OPERATORS as readonly string[]).includes(cond.operator)) {
      return { ok: false, error: "Invalid condition operator." };
    }
    if (cond.operator !== "changed" && typeof cond.value !== "string") {
      return { ok: false, error: "Condition value is required." };
    }
    conditions.push({
      field: cond.field,
      operator: cond.operator as AutomationCondition["operator"],
      value: cond.value as string | undefined,
    });
  }
  const actions: AutomationAction[] = [];
  for (const a of input.actions) {
    if (typeof a !== "object" || a === null) return { ok: false, error: "Invalid action." };
    const act = a as Record<string, unknown>;
    if (typeof act.type !== "string" || !(AUTOMATION_ACTION_TYPES as readonly string[]).includes(act.type)) {
      return { ok: false, error: "Invalid action type." };
    }
    actions.push({
      type: act.type as AutomationAction["type"],
      value: typeof act.value === "string" ? act.value : undefined,
    });
  }
  const enabled = input.enabled === true || input.enabled === "true" || input.enabled === "on";
  return {
    ok: true,
    rule: { name: input.name.trim(), enabled, trigger: input.trigger, conditions, actions },
  };
}

/** Check if a single condition matches. */
export function conditionMatches(
  condition: AutomationCondition,
  current: Record<string, unknown>,
  previous: Record<string, unknown> | null,
): boolean {
  const fieldValue = current[condition.field];
  switch (condition.operator) {
    case "equals":
      return String(fieldValue ?? "") === String(condition.value ?? "");
    case "not_equals":
      return String(fieldValue ?? "") !== String(condition.value ?? "");
    case "changed":
      return previous === null || String(previous[condition.field] ?? "") !== String(fieldValue ?? "");
    case "contains":
      return String(fieldValue ?? "").toLowerCase().includes(String(condition.value ?? "").toLowerCase());
  }
}

/** Check if all conditions match. */
export function allConditionsMatch(
  conditions: AutomationCondition[],
  current: Record<string, unknown>,
  previous: Record<string, unknown> | null,
): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => conditionMatches(c, current, previous));
}

/** Determine which trigger fired based on changes. */
export function detectTrigger(
  previous: Record<string, unknown> | null,
  current: Record<string, unknown>,
): string {
  if (!previous) return "issue_created";
  if (previous.status !== current.status) return "status_changed";
  if (previous.priority !== current.priority) return "priority_changed";
  if (previous.assigneeId !== current.assigneeId) return "assignee_changed";
  return "issue_updated";
}
