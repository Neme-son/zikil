"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PublicIdeaMatch } from "@/lib/public-idea-intake";

type FormState = {
  error: string | null;
  fieldErrors: Record<string, string[]>;
  matches: PublicIdeaMatch[];
};

const EMPTY_STATE: FormState = { error: null, fieldErrors: {}, matches: [] };

function trackingToken(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function PublicIdeaForm({ orgSlug, projectSlug }: { orgSlug: string; projectSlug: string }) {
  const router = useRouter();
  const token = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [state, setState] = useState<FormState>(EMPTY_STATE);
  const [pending, setPending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [acknowledgeSimilar, setAcknowledgeSimilar] = useState(false);
  const endpoint = `/api/public/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectSlug)}/ideas`;

  useEffect(() => {
    if (title.trim().length < 8) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const result = await fetch(`${endpoint}?q=${encodeURIComponent(title.trim())}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const body = await result.json() as { matches?: PublicIdeaMatch[] };
        if (result.ok) setState((current) => ({ ...current, matches: body.matches ?? [] }));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setState((current) => ({ ...current, matches: [] }));
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [endpoint, title]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState((current) => ({ ...current, error: null, fieldErrors: {} }));
    const data = new FormData(event.currentTarget);
    token.current ??= trackingToken();
    try {
      const result = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          summary: data.get("summary"),
          description: data.get("description"),
          stepsToReproduce: data.get("stepsToReproduce"),
          expectedBehavior: data.get("expectedBehavior"),
          actualBehavior: data.get("actualBehavior"),
          website: data.get("website"),
          acknowledgeSimilar,
          trackingToken: token.current,
        }),
      });
      const body = await result.json() as {
        message?: string;
        fieldErrors?: Record<string, string[]>;
        matches?: PublicIdeaMatch[];
        trackingPath?: string;
      };
      if (result.ok && body.trackingPath) {
        router.push(body.trackingPath);
        return;
      }
      if (result.status === 409 && body.matches?.length) {
        setAcknowledgeSimilar(true);
        setState({ error: body.message ?? "Review the possible matches.", fieldErrors: {}, matches: body.matches });
        return;
      }
      setState({ error: body.message ?? "The report could not be submitted.", fieldErrors: body.fieldErrors ?? {}, matches: [] });
    } catch {
      setState({ error: "The report could not be submitted. Check your connection and try again.", fieldErrors: {}, matches: [] });
    } finally {
      setPending(false);
    }
  }

  const fieldError = (field: string) => state.fieldErrors[field]?.[0];

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="public-report-website">Website</label>
        <input id="public-report-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error ? <p role="alert" className="rounded-xl bg-zk-bad-bg p-3 text-sm text-zk-bad-fg">{state.error}</p> : null}

      <label htmlFor="public-report-title" className="block space-y-1.5 text-sm font-semibold text-zk-text">
        Issue title
        <Input
          id="public-report-title"
          name="title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setAcknowledgeSimilar(false);
            setState((current) => ({ ...current, matches: [] }));
          }}
          minLength={3}
          maxLength={200}
          required
          aria-describedby={fieldError("title") ? "public-report-title-error" : undefined}
        />
        {fieldError("title") ? <span id="public-report-title-error" className="block text-xs text-zk-bad-fg">{fieldError("title")}</span> : null}
      </label>

      {searching ? <p role="status" className="text-xs text-zk-muted">Checking for similar reports…</p> : null}
      {state.matches.length > 0 ? (
        <section aria-labelledby="possible-matches-heading" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 id="possible-matches-heading" className="text-sm font-bold text-zk-text">Possible existing reports</h2>
          <p className="mt-1 text-xs text-zk-text2">Open these first. Submit anyway only when your report is different.</p>
          <ul className="mt-3 space-y-2">
            {state.matches.map((match) => (
              <li key={`${match.kind}-${match.number}`}>
                <a href={match.path} target="_blank" rel="noreferrer" className="text-sm font-semibold text-zk-accent hover:underline">
                  {match.kind === "idea" ? "Idea" : "Issue"} #{match.number}: {match.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <label htmlFor="public-report-summary" className="block space-y-1.5 text-sm font-semibold text-zk-text">
        Short summary
        <Textarea id="public-report-summary" name="summary" minLength={20} maxLength={300} rows={3} required aria-describedby="public-report-summary-hint" />
        <span id="public-report-summary-hint" className="block text-xs font-normal text-zk-muted">Plain text, up to three lines. Explain what is wrong and where.</span>
        {fieldError("summary") ? <span className="block text-xs text-zk-bad-fg">{fieldError("summary")}</span> : null}
      </label>

      <label htmlFor="public-report-description" className="block space-y-1.5 text-sm font-semibold text-zk-text">
        Details
        <Textarea id="public-report-description" name="description" minLength={10} maxLength={2400} rows={7} required />
        {fieldError("description") ? <span className="block text-xs text-zk-bad-fg">{fieldError("description")}</span> : null}
      </label>

      <label htmlFor="public-report-steps" className="block space-y-1.5 text-sm font-semibold text-zk-text">
        Steps to reproduce <span className="font-normal text-zk-muted">(optional)</span>
        <Textarea id="public-report-steps" name="stepsToReproduce" maxLength={1000} rows={5} />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor="public-report-expected" className="block space-y-1.5 text-sm font-semibold text-zk-text">
          Expected behaviour <span className="font-normal text-zk-muted">(optional)</span>
          <Textarea id="public-report-expected" name="expectedBehavior" maxLength={700} rows={4} />
        </label>
        <label htmlFor="public-report-actual" className="block space-y-1.5 text-sm font-semibold text-zk-text">
          Actual behaviour <span className="font-normal text-zk-muted">(optional)</span>
          <Textarea id="public-report-actual" name="actualBehavior" maxLength={700} rows={4} />
        </label>
      </div>

      <div className="rounded-xl border border-zk-border bg-zk-chip p-4 text-xs leading-5 text-zk-text2">
        This creates a public idea for agent triage, not an assignment. Guests cannot vote, bid, claim, review, merge, or upload files. Keep secrets and personal data out of the report.
      </div>

      <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Submitting…" : acknowledgeSimilar ? "Submit as a different report" : "Submit issue"}
      </Button>
    </form>
  );
}
