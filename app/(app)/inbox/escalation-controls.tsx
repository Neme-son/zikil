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

export function extractSuggestedReplies(body: string, type?: string): string[] {
  const clean = body.trim().replace(/\?+$/, "").trim();
  const choicePrefixRegex =
    /^(?:should\s+(?:I|we)|would\s+you\s+prefer\s+(?:to|that\s+we)|do\s+you\s+want\s+(?:me\s+to|us\s+to|to)|shall\s+we|can\s+(?:I|we))\s+/i;
  const match = clean.match(choicePrefixRegex);

  if (match) {
    const questionText = clean.slice(match[0].length).trim();
    const parts = questionText.split(/,\s*or\s+|\s+or\s+/i);
    if (parts.length === 2 && !parts[0].includes(",") && !parts[1].includes(",")) {
      const opt1 = parts[0].trim().replace(/^(?:either\s+)/i, "");
      const opt2 = parts[1].trim();
      if (
        opt1.length > 0 &&
        opt1.length <= 40 &&
        opt2.length > 0 &&
        opt2.length <= 40 &&
        !opt1.includes("?") &&
        !opt2.includes("?")
      ) {
        const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
        return [capitalize(opt1), capitalize(opt2)];
      }
    }
  }

  if (
    type === "Scope Expansion" ||
    type === "Work Authorization" ||
    type === "Human Approval"
  ) {
    return ["Proceed as proposed", "Decline"];
  }

  return [];
}

export function EscalationTypeBadge({ type }: { type: EscalationType | string }) {
  const styles: Record<string, string> = {
    Blocker: "bg-zk-bad-bg text-zk-bad-fg border-zk-bad-bd",
    "Work Authorization": "bg-zk-warn-bg text-zk-warn-fg border-zk-warn-bd",
    "Human Approval": "bg-zk-info-bg text-zk-info-fg border-zk-border",
    "No Proof": "bg-zk-warn-bg text-zk-warn-fg border-zk-warn-bd",
    "Scope Expansion": "bg-zk-warn-bg text-zk-warn-fg border-zk-warn-bd",
    Question: "bg-zk-chip text-zk-text2 border-zk-border",
    Redesign: "bg-zk-info-bg text-zk-info-fg border-zk-border",
  };

  const icons: Record<string, string> = {
    Blocker: "🛑",
    "Work Authorization": "🛡️",
    "Human Approval": "👤",
    "No Proof": "📎",
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
          className="rounded-full bg-zk-ok-fg px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 focus-visible:ring-zk-ok-fg"
        >
          {isPending ? "Unblocking…" : "✓ Approve & Unblock"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => handleResolve("authorize")}
          className="rounded-full border border-zk-border bg-zk-surface px-3.5 py-2 text-xs font-semibold text-zk-text hover:bg-zk-chip"
        >
          Authorize Work
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => handleResolve("reject")}
          className="rounded-full border border-zk-bad-bd bg-zk-bad-bg/20 px-3.5 py-2 text-xs font-semibold text-zk-bad-fg hover:bg-zk-bad-bg/30"
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

export function InlineAgentReplyBox({
  escalationId,
  body,
  type,
  onResolved,
}: {
  escalationId: string;
  body: string;
  type?: string;
  onResolved?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [customText, setCustomText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const suggestedReplies = extractSuggestedReplies(body, type);

  const handleSendAnswer = (answerText: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await answerInlineEscalationAction(escalationId, answerText);
        if (res.ok) {
          setCustomText("");
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

  const handleQuickResolve = (actionType: "approve" | "authorize" | "reject") => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await quickResolveEscalationAction(escalationId, actionType);
        if (res.ok) {
          setCustomText("");
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

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customText.trim();
    if (!trimmed) return;
    handleSendAnswer(trimmed);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={isPending}
          onClick={() => handleQuickResolve("approve")}
          className="rounded-full bg-zk-ok-fg px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 focus-visible:ring-zk-ok-fg"
        >
          {isPending ? "Unblocking…" : "✓ Approve & Unblock"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => handleQuickResolve("authorize")}
          className="rounded-full border border-zk-border bg-zk-surface px-3 py-1.5 text-xs font-semibold text-zk-text hover:bg-zk-chip"
        >
          Authorize Work
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => handleQuickResolve("reject")}
          className="rounded-full border border-zk-bad-bd bg-zk-bad-bg/20 px-3 py-1.5 text-xs font-semibold text-zk-bad-fg hover:bg-zk-bad-bg/30"
        >
          Reject
        </Button>
      </div>

      {suggestedReplies.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-zk-muted">Quick replies:</span>
          {suggestedReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              disabled={isPending}
              onClick={() => handleSendAnswer(reply)}
              className="inline-flex items-center rounded-full border border-zk-border bg-zk-surface px-2.5 py-1 text-xs font-medium text-zk-text2 hover:border-electric-blue-strong hover:bg-zk-chip hover:text-zk-text transition-colors disabled:opacity-50"
            >
              {reply}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="Reply to agent..."
          disabled={isPending}
          aria-label="Custom response to agent"
          className="h-8 flex-1 rounded-full border border-zk-border bg-zk-bg px-3.5 text-xs text-zk-text placeholder:text-zk-muted focus:border-electric-blue-strong focus:outline-none focus:ring-1 focus:ring-electric-blue-strong disabled:opacity-50"
        />
        <Button
          type="submit"
          disabled={isPending || !customText.trim()}
          className="h-8 rounded-full bg-electric-blue-strong px-3.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send"}
        </Button>
      </form>

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
