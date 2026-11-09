import { describe, expect, it } from "vitest";
import {
  allConditionsMatch,
  conditionMatches,
  detectTrigger,
  validateAutomationRule,
} from "@/lib/automation";

describe("automation rules", () => {
  it("validates rule definitions", () => {
    const valid = validateAutomationRule({
      name: "Escalate urgent",
      trigger: "status_changed",
      conditions: [{ field: "priority", operator: "equals", value: "urgent" }],
      actions: [{ type: "set_priority", value: "urgent" }],
      enabled: true,
    });
    expect(valid.ok).toBe(true);

    const noActions = validateAutomationRule({
      name: "Bad",
      trigger: "issue_updated",
      conditions: [],
      actions: [],
      enabled: true,
    });
    expect(noActions.ok).toBe(false);

    const badTrigger = validateAutomationRule({
      name: "Bad",
      trigger: "nope",
      conditions: [],
      actions: [{ type: "set_priority", value: "high" }],
      enabled: true,
    });
    expect(badTrigger.ok).toBe(false);

    const emptyName = validateAutomationRule({
      name: "",
      trigger: "issue_updated",
      conditions: [],
      actions: [{ type: "set_priority", value: "high" }],
      enabled: true,
    });
    expect(emptyName.ok).toBe(false);
  });

  it("matches conditions correctly", () => {
    const current = { status: "in_progress", priority: "high", assigneeId: "u1" };
    const previous = { status: "open", priority: "medium", assigneeId: null };

    expect(conditionMatches({ field: "status", operator: "equals", value: "in_progress" }, current, previous)).toBe(true);
    expect(conditionMatches({ field: "status", operator: "not_equals", value: "open" }, current, previous)).toBe(true);
    expect(conditionMatches({ field: "status", operator: "changed" }, current, previous)).toBe(true);
    expect(conditionMatches({ field: "priority", operator: "changed" }, current, previous)).toBe(true);
    expect(conditionMatches({ field: "title", operator: "contains", value: "bug" }, { title: "Fix the bug" }, null)).toBe(true);
  });

  it("requires all conditions to match", () => {
    const current = { status: "in_progress", priority: "high" };
    const previous = { status: "open", priority: "medium" };
    const conditions = [
      { field: "status", operator: "equals" as const, value: "in_progress" },
      { field: "priority", operator: "equals" as const, value: "low" },
    ];
    expect(allConditionsMatch(conditions, current, previous)).toBe(false);

    const matching = [
      { field: "status", operator: "equals" as const, value: "in_progress" },
      { field: "priority", operator: "equals" as const, value: "high" },
    ];
    expect(allConditionsMatch(matching, current, previous)).toBe(true);
    expect(allConditionsMatch([], current, previous)).toBe(true);
  });

  it("detects the trigger from changes", () => {
    expect(detectTrigger(null, { status: "open" })).toBe("issue_created");
    expect(detectTrigger({ status: "open" }, { status: "in_progress" })).toBe("status_changed");
    expect(detectTrigger({ status: "open", priority: "low" }, { status: "open", priority: "high" })).toBe("priority_changed");
    expect(detectTrigger({ status: "open", assigneeId: null }, { status: "open", assigneeId: "u1" })).toBe("assignee_changed");
    expect(detectTrigger({ status: "open" }, { status: "open" })).toBe("issue_updated");
  });
});
