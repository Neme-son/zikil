"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  createAutomationRuleAction,
  toggleAutomationRuleAction,
  deleteAutomationRuleAction,
} from "@/app/actions/automation";
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_CONDITION_OPERATORS,
  AUTOMATION_TRIGGERS,
} from "@/lib/automation";

export type AutomationRuleView = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  conditions: { field: string; operator: string; value?: string }[];
  actions: { type: string; value?: string }[];
};

type Props = {
  projectId: string;
  rules: AutomationRuleView[];
};

export function AutomationRulesManager({ projectId, rules }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("issue_updated");
  const [conditions, setConditions] = useState<{ field: string; operator: string; value: string }[]>([]);
  const [actions, setActions] = useState<{ type: string; value: string }[]>([{ type: "set_priority", value: "high" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addCondition = () => setConditions((c) => [...c, { field: "status", operator: "equals", value: "" }]);
  const removeCondition = (i: number) => setConditions((c) => c.filter((_, idx) => idx !== i));
  const updateCondition = (i: number, key: string, val: string) =>
    setConditions((c) => c.map((cond, idx) => (idx === i ? { ...cond, [key]: val } : cond)));

  const addAction = () => setActions((a) => [...a, { type: "set_priority", value: "" }]);
  const removeAction = (i: number) => setActions((a) => (a.length > 1 ? a.filter((_, idx) => idx !== i) : a));
  const updateAction = (i: number, key: string, val: string) =>
    setActions((a) => a.map((act, idx) => (idx === i ? { ...act, [key]: val } : act)));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createAutomationRuleAction(projectId, {
        name,
        trigger,
        conditions,
        actions,
        enabled: true,
      });
      if (result.error) { setError(result.error); return; }
      setName("");
      setConditions([]);
      setActions([{ type: "set_priority", value: "high" }]);
      router.refresh();
    });
  };

  const toggle = (ruleId: string, enabled: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await toggleAutomationRuleAction(ruleId, enabled);
      if (result.error) { setError(result.error); return; }
      router.refresh();
    });
  };

  const remove = (ruleId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteAutomationRuleAction(ruleId);
      if (result.error) { setError(result.error); return; }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-[14px] border border-zk-border bg-zk-bg p-4">
        <label className="text-xs font-medium text-zk-muted">
          Rule name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Escalate urgent issues"
            className="mt-1 block w-full rounded-lg border border-zk-border bg-zk-surface px-3 py-2 text-sm text-zk-text placeholder:text-zk-muted focus:outline-none focus:ring-2 focus:ring-zk-accent"
          />
        </label>

        <label className="w-48 text-xs font-medium text-zk-muted">
          Trigger
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-zk-border bg-zk-surface px-3 py-2 text-sm text-zk-text focus:outline-none focus:ring-2 focus:ring-zk-accent"
          >
            {AUTOMATION_TRIGGERS.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-zk-muted">Conditions (all must match)</span>
            <button type="button" onClick={addCondition} className="text-xs text-zk-accent underline">+ Add</button>
          </div>
          {conditions.map((cond, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <select value={cond.field} onChange={(e) => updateCondition(i, "field", e.target.value)} className="rounded-lg border border-zk-border bg-zk-surface px-2 py-1 text-sm text-zk-text">
                {AUTOMATION_CONDITION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={cond.operator} onChange={(e) => updateCondition(i, "operator", e.target.value)} className="rounded-lg border border-zk-border bg-zk-surface px-2 py-1 text-sm text-zk-text">
                {AUTOMATION_CONDITION_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {cond.operator !== "changed" ? (
                <input value={cond.value} onChange={(e) => updateCondition(i, "value", e.target.value)} placeholder="value" className="rounded-lg border border-zk-border bg-zk-surface px-2 py-1 text-sm text-zk-text" />
              ) : null}
              <button type="button" onClick={() => removeCondition(i)} className="text-xs text-zk-muted underline">Remove</button>
            </div>
          ))}
          {conditions.length === 0 ? <p className="m-0 text-xs text-zk-muted">No conditions — rule fires on every trigger.</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-zk-muted">Actions</span>
            <button type="button" onClick={addAction} className="text-xs text-zk-accent underline">+ Add</button>
          </div>
          {actions.map((act, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <select value={act.type} onChange={(e) => updateAction(i, "type", e.target.value)} className="rounded-lg border border-zk-border bg-zk-surface px-2 py-1 text-sm text-zk-text">
                {AUTOMATION_ACTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
              <input value={act.value} onChange={(e) => updateAction(i, "value", e.target.value)} placeholder="value" className="rounded-lg border border-zk-border bg-zk-surface px-2 py-1 text-sm text-zk-text" />
              <button type="button" onClick={() => removeAction(i)} className="text-xs text-zk-muted underline">Remove</button>
            </div>
          ))}
        </div>

        <button type="submit" disabled={pending || !name.trim()} className="self-start rounded-lg border border-zk-border px-3 py-2 text-sm font-semibold text-zk-text disabled:opacity-50">
          {pending ? "Creating…" : "Create rule"}
        </button>
      </form>

      {error ? <p role="alert" className="m-0 text-sm text-zk-bad-fg">{error}</p> : null}

      {rules.length ? (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-zk-border bg-zk-bg px-3 py-2 text-sm">
              <div className="flex flex-col">
                <span className="font-semibold text-zk-text">{rule.name}</span>
                <span className="text-xs text-zk-muted">
                  Trigger: {rule.trigger.replace(/_/g, " ")} · {rule.conditions.length} condition(s) · {rule.actions.length} action(s)
                </span>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={() => toggle(rule.id, !rule.enabled)} className="text-xs text-zk-muted underline hover:text-zk-text disabled:opacity-50">
                  {rule.enabled ? "Disable" : "Enable"}
                </button>
                <button type="button" disabled={pending} onClick={() => remove(rule.id)} className="text-xs text-zk-muted underline hover:text-zk-text disabled:opacity-50">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-zk-muted">No automation rules yet.</p>
      )}
    </div>
  );
}
