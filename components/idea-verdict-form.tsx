"use client";

import { useId, useState, useTransition } from "react";
import { giveIdeaVerdictAction } from "@/app/actions/idea-verdicts";

type Opinion = "good" | "bad" | "neutral";

const OPINIONS: { value: Opinion; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "neutral", label: "Neutral" },
  { value: "bad", label: "Bad" },
];

/** Sentences end in `.`, `!` or `?` and a space or the end, as the server counts them. */
function sentences(text: string): number {
  return text.trim().split(/(?<=[.!?])\s+/).filter((part) => part.trim()).length;
}

/**
 * A person's verdict on an idea (#idea-verdicts): good, bad or neutral, a
 * summary of two sentences at most, and a full description. Giving it again replaces
 * the earlier one.
 */
export function IdeaVerdictForm({
  ideaId,
  summaryMaxChars,
  initialOpinion = null,
  initialSummary = "",
  initialDescription = "",
  onSaved,
}: {
  ideaId: string;
  summaryMaxChars: number;
  initialOpinion?: Opinion | null;
  initialSummary?: string;
  initialDescription?: string;
  /** Called once the verdict is saved, so a dialog can close. */
  onSaved?: () => void;
}) {
  const id = useId();
  const [opinion, setOpinion] = useState<Opinion | null>(initialOpinion);
  const [summary, setSummary] = useState(initialSummary);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const replacing = initialOpinion !== null;
  const left = summaryMaxChars - summary.length;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(null);
    if (!opinion) return setError("Pick good, bad or neutral.");
    if (!summary.trim()) return setError("Add a summary.");
    if (sentences(summary) > 2) return setError("Keep the summary to two sentences.");
    if (!description.trim()) return setError("Add a description explaining your verdict.");
    const data = new FormData();
    data.set("opinion", opinion);
    data.set("summary", summary);
    data.set("description", description);
    startTransition(async () => {
      const result = await giveIdeaVerdictAction(ideaId, data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(result.replaced ? "Your verdict was updated." : "Your verdict was saved.");
      onSaved?.();
    });
  };

  return (
    <form onSubmit={onSubmit} aria-label="Your verdict" className="flex flex-col gap-3">
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-semibold text-zk-text">
          {replacing ? "Change your verdict" : "Your verdict"}
        </legend>
        <div className="flex flex-wrap gap-2">
          {OPINIONS.map((option) => (
            <label
              key={option.value}
              className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-electric-blue-strong ${
                opinion === option.value
                  ? "border-electric-blue-strong bg-electric-blue-strong text-white"
                  : "border-zk-border bg-zk-surface text-zk-text hover:bg-zk-chip"
              }`}
            >
              <input
                type="radio"
                name="opinion"
                value={option.value}
                checked={opinion === option.value}
                onChange={() => setOpinion(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-summary`} className="text-[13px] font-semibold text-zk-text">
          Summary
        </label>
        <textarea
          id={`${id}-summary`}
          name="summary"
          rows={2}
          maxLength={summaryMaxChars}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          aria-describedby={`${id}-summary-help`}
          className="w-full rounded-xl border border-zk-border bg-zk-surface px-3 py-2 text-sm text-zk-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong"
        />
        <p id={`${id}-summary-help`} className="m-0 text-xs text-zk-muted">
          Two sentences at most. <span className="tabular-nums">{left}</span> {left === 1 ? "character" : "characters"} left.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-description`} className="text-[13px] font-semibold text-zk-text">
          Description
        </label>
        <textarea
          id={`${id}-description`}
          name="description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-describedby={`${id}-description-help`}
          className="w-full rounded-xl border border-zk-border bg-zk-surface px-3 py-2 text-sm text-zk-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong"
        />
        <p id={`${id}-description-help`} className="m-0 text-xs text-zk-muted">
          Why you think so, in full. Ideas take verdicts only, so this is where your reasoning goes.
        </p>
      </div>

      {error ? (
        <p role="alert" className="m-0 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="m-0 text-xs font-medium text-zk-ok-fg">
          {saved}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-full bg-electric-blue-strong px-4 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : replacing ? "Update verdict" : "Give verdict"}
        </button>
      </div>
    </form>
  );
}
