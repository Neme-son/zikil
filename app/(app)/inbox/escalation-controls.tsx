"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  answerEscalationAction,
  answerInlineEscalationAction,
  quickResolveEscalationAction,
  type AnswerActionResult,
} from "./actions";
import type { EscalationType } from "@/lib/agent-questions";

function capitalizeClause(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(
      /^(?:should\s+(?:i|we)\s+|do\s+you\s+want\s+(?:me\s+)?to\s+|would\s+you\s+prefer\s+(?:to\s+)?|whether\s+to\s+)/i,
      "",
    )
    .replace(/[?.!,;]+$/, "")
    .trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Extracts contextual reply suggestions from the agent's question body
 * when the question asks a clear two-option "A or B?" choice. When the
 * question has multiple "or"s or is ambiguous, falls back to no pills.
 * Type-based fallback pills are only offered for approval-oriented types.
 */
export function extractSuggestedReplies(
  cleanBody: string,
  type: EscalationType | string,
): { label: string; value: string }[] {
  const sentences = cleanBody.split(/(?<=[.?!])\s+/);
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i].trim();
    if (!s.endsWith("?")) continue;
    const prefixMatch = s.match(
      /(?:should\s+(?:i|we)\s+|do\s+you\s+want\s+(?:me\s+)?to\s+|would\s+you\s+prefer\s+(?:to\s+)?|can\s+(?:i|we)\s+)([^?]+)\?$/i,
    );
    if (!prefixMatch) continue;

    const clause = prefixMatch[1].trim();
    const parts = clause.split(/\s*,?\s+\bor\b\s+/i);
    // If there are multiple "or"s (e.g. "Should I refactor or rewrite the parser, or leave it?"),
    // the choice is ambiguous: return no pills at all rather than guessing.
    if (parts.length > 2) {
      return [];
    }
    if (parts.length === 2) {
      const optA = capitalizeClause(parts[0]);
      const optB = capitalizeClause(parts[1]);
      if (
        optA &&
        optB &&
        optA.length <= 72 &&
        optB.length <= 72 &&
        !optA.includes(",") &&
        !optB.includes(",") &&
        !/\bor\b/i.test(optA) &&
        !/\bor\b/i.test(optB)
      ) {
        return [
          { label: optA, value: `${optA}.` },
          { label: optB, value: `${optB}.` },
        ];
      }
      return [];
    }
  }

  switch (type) {
    case "Scope Expansion":
      return [
        { label: "Approve expanded scope", value: "Approved. Include the related fix in this PR." },
        { label: "Keep strictly to ticket scope", value: "Keep this PR strictly scoped to the reported issue." },
      ];
    case "Work Authorization":
      return [
        { label: "Authorize work", value: "Work authorized. You may begin implementation." },
        { label: "Decline", value: "Declined. Do not proceed with this direction." },
      ];
    case "Human Approval":
      return [
        { label: "Approve approach", value: "Approved. Proceed with your proposed approach." },
        { label: "Decline", value: "Declined. Do not proceed with this direction." },
      ];
    default:
      // Factual questions and blockers have no safe generic approval fallback.
      return [];
  }
}

export function InlineAgentReplyBox({
  escalationId,
  agentName,
  cleanBody,
  escalationType,
}: {
  escalationId: string;
  agentName: string;
  cleanBody: string;
  escalationType: EscalationType | string;
}) {
  const router = useRouter();
  const suggestions = extractSuggestedReplies(cleanBody, escalationType);
  const [answer, setAnswer] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (!answer.trim()) {
      setError("Write or choose an answer before sending.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await answerInlineEscalationAction(escalationId, answer.trim());
        if (res.ok) {
          router.refresh();
        } else {
          setError(res.error);
        }
      } catch {
        setError("Could not send your response. Please try again.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-zk-muted">Quick replies:</span>
          {suggestions.map((s) => {
            const active = answer.trim() === s.value.trim();
            return (
              <button
                key={s.label}
                type="button"
                disabled={isPending}
                onClick={() => {
                  setAnswer(s.value);
                  setError(null);
                }}
                className={`rounded-full border px-3 py-1 text-left text-xs font-medium transition cursor-pointer ${
                  active
                    ? "border-electric-blue-strong bg-zk-info-bg text-zk-info-fg"
                    : "border-zk-border bg-zk-chip/40 text-zk-text2 hover:border-zk-text2/40 hover:bg-zk-chip hover:text-zk-text"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={answer}
          disabled={isPending}
          onChange={(e) => {
            setAnswer(e.target.value);
            if (error) setError(null);
          }}
          placeholder={`Reply to ${agentName}…`}
          aria-label={`Reply to ${agentName}`}
          maxLength={2000}
          className="h-9 flex-1 rounded-xl border border-zk-border bg-zk-bg px-3.5 text-sm text-zk-text placeholder:text-zk-muted focus:border-electric-blue-strong focus:bg-zk-surface focus:outline-none"
        />
        <Button
          type="submit"
          disabled={isPending || !answer.trim()}
          className="h-9 shrink-0 rounded-xl bg-electric-blue-strong px-4 text-xs font-semibold text-white hover:opacity-90 cursor-pointer"
        >
          {isPending ? "Sending…" : "Reply & unblock"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-zk-bad-fg">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function EscalationTypeBadge({ type }: { type: EscalationType | string }) {
  const styles: Record<string, string> = {
    Blocker: "bg-zk-bad-bg text-zk-bad-fg border-zk-bad-bd",
    "Work Authorization": "bg-zk-warn-bg text-zk-warn-fg border-zk-warn-bd",
    "Human Approval": "bg-zk-info-bg text-zk-info-fg border-zk-border",
    "Scope Expansion": "bg-zk-warn-bg text-zk-warn-fg border-zk-warn-bd",
    Question: "bg-zk-chip text-zk-text2 border-zk-border",
    Redesign: "bg-zk-info-bg text-zk-info-fg border-zk-border",
  };

  const icons: Record<string, string> = {
    Blocker: "🛑",
    "Work Authorization": "🛡️",
    "Human Approval": "👤",
    "Scope Expansion": "⚠️",
    Question: "❓",
    Redesign: "✎",
  };

  const badgeStyle = styles[type] ?? styles.Question;
  const icon = icons[type] ?? "❓";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeStyle}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{type}</span>
    </span>
  );
}

export function QuickResolveButtons({
  escalationId,
  onResolved,
}: {
  escalationId: string;
  onResolved?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleResolve = (actionType: "approve" | "authorize" | "reject") => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await quickResolveEscalationAction(escalationId, actionType);
        if (res.ok) {
          onResolved?.();
          router.refresh();
        } else {
          setError(res.error);
        }
      } catch {
        setError("Could not send your response. Please try again.");
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={isPending}
          onClick={() => handleResolve("approve")}
          className="rounded-full bg-zk-ok-fg px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 focus-visible:ring-zk-ok-fg"
        >
          {isPending ? "Unblocking…" : "✓ Approve & Unblock"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => handleResolve("authorize")}
          className="rounded-full border border-zk-border bg-zk-surface px-3.5 py-1.5 text-xs font-semibold text-zk-text hover:bg-zk-chip"
        >
          Authorize Work
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => handleResolve("reject")}
          className="rounded-full border border-zk-bad-bd bg-zk-bad-bg px-3.5 py-1.5 text-xs font-semibold text-zk-bad-fg hover:opacity-90"
        >
          Reject
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-zk-bad-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function EscalationAnswerForm({
  escalationId,
  labelledBy,
}: {
  escalationId: string;
  labelledBy?: string;
}) {
  const [result, action, pending] = useActionState<AnswerActionResult | undefined, FormData>(
    answerEscalationAction,
    undefined,
  );
  const error = result && !result.ok ? result.error : null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="escalationId" value={escalationId} />
      <div className="space-y-1">
        {!labelledBy ? (
          <label htmlFor="answer" className="block text-sm font-semibold text-zk-text">
            Your response
          </label>
        ) : null}
        <Textarea
          id="answer"
          name="answer"
          rows={4}
          required
          maxLength={2000}
          placeholder="Provide decision, unblocking guidance, or instructions..."
          aria-labelledby={labelledBy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "answer-error" : undefined}
        />
      </div>
      {error ? (
        <p id="answer-error" role="alert" className="text-sm text-zk-bad-fg">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={pending}
          className="rounded-full bg-electric-blue-strong px-4 py-2 font-semibold text-white hover:opacity-90 focus-visible:ring-electric-blue"
        >
          {pending ? "Sending…" : "Send response"}
        </Button>
        <span className="text-xs text-zk-muted">
          The response cannot be edited once dispatched to the agent.
        </span>
      </div>
    </form>
  );
}
