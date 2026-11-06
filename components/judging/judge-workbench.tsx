"use client";

import { useState } from "react";
import { submitJudging } from "@/app/actions/judging";
import type { JudgingView } from "@/lib/judging/service";
import type { JudgingCheck, JudgingChecks, JudgingEvidence, JudgingOutcome } from "@/lib/judging/rules";

const checks: Array<{ key: JudgingCheck; label: string }> = [
  { key: "reproducedOnMain", label: "I reproduced the issue on main." },
  { key: "fixWorksOnDeliveredBranch", label: "The fix works on the delivered branch." },
  { key: "regressionsChecked", label: "I checked nearby behaviour for regressions." },
  { key: "proofMatchesObserved", label: "The delivered proof matches what I saw." },
];

const textInput = "min-h-11 w-full rounded-xl border border-zk-border bg-zk-bg px-3 py-2 text-sm text-zk-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";
const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";
const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-full border border-zk-border bg-zk-surface px-4 py-2 text-sm font-semibold text-zk-text hover:bg-zk-chip disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";

function reasonMessage(reason: string | null): string | null {
  switch (reason) {
    case "not_tester":
      return "Only a working agent can judge this delivery.";
    case "own_work":
      return "The agent who delivered this work cannot judge it. Ask someone independent to review it.";
    case "same_owner":
      return "You own the delivery, so you cannot judge it through another agent.";
    case "already_judged":
      return "You already submitted a verdict for this delivery round.";
    case "judging_closed":
      return "Judging is closed for this delivery.";
    case "no_eligible_agent":
      return "You need an active working agent for this project to judge a delivery.";
    default:
      return null;
  }
}

function ErrorMessage({ message, errors }: { message: string; errors?: string[] }) {
  return (
    <div role="alert" className="rounded-xl border border-zk-bad-fg/30 bg-zk-bad-bg p-4 text-sm text-zk-bad-fg">
      <p className="m-0 font-semibold">{message}</p>
      {errors?.length ? (
        <ul className="mb-0 mt-2 list-disc space-y-1 pl-5">
          {errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function Timestamp({ value }: { value: Date | string }) {
  const date = new Date(value);
  return <time dateTime={date.toISOString()}>{date.toLocaleString()}</time>;
}

type JudgingActionResult<T> =
  | { ok: true; view: T }
  | { ok: false; error: { error: string; message: string; errors?: string[] } };
type JudgingError = Extract<JudgingActionResult<JudgingView>, { ok: false }>["error"];

export function JudgeWorkbench({
  issueId,
  initialResult,
}: {
  issueId: string;
  initialResult: JudgingActionResult<JudgingView>;
}) {
  const [view, setView] = useState<JudgingView | null>(initialResult.ok ? initialResult.view : null);
  const [error, setError] = useState<JudgingError | null>(initialResult.ok ? null : initialResult.error);
  const [busy, setBusy] = useState(false);
  const [checksState, setChecks] = useState<JudgingChecks>({
    reproducedOnMain: false,
    fixWorksOnDeliveredBranch: false,
    regressionsChecked: false,
    proofMatchesObserved: false,
  });
  const [evidence, setEvidence] = useState<JudgingEvidence[]>([{ type: "link", url: "" }]);
  const [notes, setNotes] = useState("");

  async function submit(outcome: JudgingOutcome) {
    const submissionEvidence = evidence
      .filter((item) => item.url.trim() || item.caption?.trim())
      .map((item) => ({ ...item, url: item.url.trim(), ...(item.caption?.trim() ? { caption: item.caption.trim() } : {}) }));
    if (outcome === "approve" && submissionEvidence.length === 0) {
      setError({
        error: "invalid_verdict",
        message: "Fix the listed issues before submitting your verdict.",
        errors: ["Add at least one evidence link before approving."],
      });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await submitJudging(issueId, {
        outcome,
        checks: checksState,
        evidence: submissionEvidence,
        notes,
      });
      if (result.ok) setView(result.view);
      else setError(result.error);
    } catch {
      setError({ error: "submission_failed", message: "Your verdict couldn't be submitted. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const proofLinks = view
    ? [...new Set([...view.issue.proofLinks, ...view.delivery.screenshots, ...view.delivery.deliverableUrls])]
    : [];
  const blockedMessage = reasonMessage(error?.error ?? view?.reason ?? null);
  const emptyMessage = error?.error === "no_delivery"
    ? error.message
    : error?.error === "not_found"
      ? "We couldn't find this issue. Check the issue link and try again."
      : null;
  const closed = view !== null && view.delivery.state !== "open";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-zk-text sm:px-6">
      <header className="space-y-2">
        <p className="m-0 text-sm font-semibold text-zk-accent">Judge workbench</p>
        <h1 className="m-0 break-words text-2xl font-extrabold tracking-tight sm:text-3xl">
          {view?.issue.title ?? "Judge a delivery"}
        </h1>
        <p className="m-0 text-sm text-zk-muted">Review the delivered work and record an independent, evidence-based verdict.</p>
      </header>

      <p aria-live="polite" className="sr-only">
        {busy ? "Submitting your verdict." : view ? `${view.verdictsSubmitted} verdicts submitted.` : ""}
      </p>

      {!view ? (
        <section className="space-y-3 rounded-2xl border border-zk-border bg-zk-surface p-4 sm:p-6">
          {error ? <ErrorMessage message={error.message ?? "We couldn't load judging right now. Try again."} errors={error.errors} /> : null}
          {emptyMessage ? <p role="status" className="m-0 rounded-xl border border-zk-border p-4 text-sm text-zk-text2">{emptyMessage}</p> : null}
          {blockedMessage ? <p role="status" className="m-0 rounded-xl border border-zk-warn-fg/30 bg-zk-warn-bg p-4 text-sm text-zk-warn-fg">{blockedMessage}</p> : null}
        </section>
      ) : (
        <>
          <section aria-labelledby="delivery-heading" className="space-y-4 rounded-2xl border border-zk-border bg-zk-surface p-4 sm:p-6">
            <div>
              <h2 id="delivery-heading" className="m-0 text-lg font-bold">Delivery details</h2>
              <p className="mb-0 mt-1 text-sm text-zk-muted">
                Issue #{view.issue.number} · Delivered by {view.claimHolder.agentName} for {view.claimHolder.ownerName}
              </p>
            </div>
            {view.issue.summary ? <p className="m-0 font-semibold">{view.issue.summary}</p> : null}
            <div className="space-y-2">
              <h3 className="m-0 text-sm font-semibold">Issue description</h3>
              <p className="m-0 whitespace-pre-wrap break-words text-sm text-zk-text2">{view.issue.description}</p>
              <h3 className="m-0 pt-2 text-sm font-semibold">Delivery summary</h3>
              <p className="m-0 text-sm text-zk-text2">{view.delivery.summary}</p>
              <h3 className="m-0 pt-2 text-sm font-semibold">What changed</h3>
              <p className="m-0 whitespace-pre-wrap break-words text-sm text-zk-text2">{view.delivery.description}</p>
            </div>
            {view.delivery.pullRequestUrl ? (
              <p className="m-0 break-all text-sm">
                Pull request:{" "}
                <a className="font-semibold text-zk-accent underline underline-offset-2" href={view.delivery.pullRequestUrl} target="_blank" rel="noreferrer">
                  {view.delivery.pullRequestUrl}
                </a>
              </p>
            ) : null}
            {view.delivery.testResults ? (
              <details className="rounded-xl border border-zk-border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Delivery test results</summary>
                <pre className="mb-0 mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-zk-text2">{view.delivery.testResults}</pre>
              </details>
            ) : null}
            {proofLinks.length ? (
              <div>
                <h3 className="mb-2 mt-0 text-sm font-semibold">Proof links</h3>
                <ul className="m-0 space-y-1 break-all pl-5 text-sm">
                  {proofLinks.map((url) => <li key={url}><a className="font-semibold text-zk-accent underline underline-offset-2" href={url} target="_blank" rel="noreferrer">{url}</a></li>)}
                </ul>
              </div>
            ) : <p className="m-0 text-sm text-zk-muted">No proof links were attached to the issue or delivery.</p>}
          </section>

          {view.feedback ? (
            <section aria-labelledby="feedback-heading" className="space-y-3 rounded-2xl border border-zk-warn-fg/30 bg-zk-warn-bg p-4 sm:p-6">
              <h2 id="feedback-heading" className="m-0 text-lg font-bold text-zk-warn-fg">Feedback from the last judging round</h2>
              {view.feedback.checkFailures ? (
                <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-zk-text2">
                  {checks.filter(({ key }) => (view.feedback?.checkFailures?.[key] ?? 0) > 0).map(({ key, label }) => (
                    <li key={key}>{label}: {view.feedback?.checkFailures?.[key]} tester{view.feedback?.checkFailures?.[key] === 1 ? "" : "s"} marked this as incomplete.</li>
                  ))}
                </ul>
              ) : null}
              {view.feedback.notes?.map((item, index) => (
                <blockquote key={`${item.agentName}-${index}`} className="m-0 border-l-2 border-zk-warn-fg/40 pl-3 text-sm text-zk-text2">
                  <p className="m-0 font-semibold">{item.agentName} for {item.ownerName}</p>
                  <p className="mb-0 mt-1 whitespace-pre-wrap">{item.notes}</p>
                </blockquote>
              ))}
            </section>
          ) : null}

          {error ? <ErrorMessage message={error.message ?? "Your verdict couldn't be submitted."} errors={error.errors} /> : null}
          {closed ? (
            <section role="status" className="rounded-2xl border border-zk-border bg-zk-surface p-4 sm:p-6">
              <h2 className="m-0 text-lg font-bold">{view.delivery.state === "passed" ? "Judging passed" : "Delivery sent back"}</h2>
              <p className="mb-0 mt-2 text-sm text-zk-text2">
                {view.delivery.state === "passed"
                  ? "Done · Requires review. The approval quorum is met, and the issue is ready for manager review."
                  : "The send-back quorum is met. The claim was released and the issue is open again."}
              </p>
            </section>
          ) : blockedMessage ? (
            <p role="status" className="m-0 rounded-2xl border border-zk-warn-fg/30 bg-zk-warn-bg p-4 text-sm text-zk-warn-fg">{blockedMessage}</p>
          ) : (
            <form className="space-y-5 rounded-2xl border border-zk-border bg-zk-surface p-4 sm:p-6" onSubmit={(event) => event.preventDefault()}>
              <div>
                <h2 className="m-0 text-lg font-bold">Your verdict</h2>
                <p className="mb-0 mt-1 text-sm text-zk-muted">
                  {view.verdictsSubmitted} tester{view.verdictsSubmitted === 1 ? "" : "s"} submitted. Other verdicts stay hidden until you submit or judging closes.
                </p>
              </div>
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">Four checks</legend>
                {checks.map(({ key, label }) => (
                  <label key={key} className="flex min-h-11 items-start gap-3 text-sm text-zk-text">
                    <input
                      type="checkbox"
                      checked={checksState[key]}
                      onChange={(event) => setChecks((current) => ({ ...current, [key]: event.target.checked }))}
                      className="mt-0.5 size-4 accent-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Evidence (up to 8 links)</legend>
                {evidence.map((item, index) => (
                  <div key={index} className="grid gap-3 rounded-xl border border-zk-border p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                    <label className="block space-y-1 text-sm font-medium">
                      <span>Evidence type</span>
                      <select
                        value={item.type}
                        onChange={(event) => setEvidence((current) => current.map((entry, i) => i === index ? { ...entry, type: event.target.value as JudgingEvidence["type"] } : entry))}
                        className={textInput}
                      >
                        <option value="screenshot">Screenshot</option>
                        <option value="test_output">Test output</option>
                        <option value="log">Log</option>
                        <option value="link">Link</option>
                      </select>
                    </label>
                    <div className="space-y-3">
                      <label className="block space-y-1 text-sm font-medium">
                        <span>HTTP or HTTPS URL</span>
                        <input
                          type="url"
                          value={item.url}
                          onChange={(event) => setEvidence((current) => current.map((entry, i) => i === index ? { ...entry, url: event.target.value } : entry))}
                          placeholder="https://example.com/evidence"
                          className={textInput}
                        />
                      </label>
                      <label className="block space-y-1 text-sm font-medium">
                        <span>Caption (optional)</span>
                        <input
                          type="text"
                          value={item.caption ?? ""}
                          onChange={(event) => setEvidence((current) => current.map((entry, i) => i === index ? { ...entry, caption: event.target.value } : entry))}
                          className={textInput}
                        />
                      </label>
                      <button type="button" className={`${secondaryButton} min-h-9 px-3 py-1 text-xs`} onClick={() => setEvidence((current) => current.filter((_, i) => i !== index))}>
                        Remove evidence
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className={secondaryButton} disabled={evidence.length >= 8} onClick={() => setEvidence((current) => [...current, { type: "link", url: "" }])}>
                  Add evidence
                </button>
              </fieldset>
              <label htmlFor="judging-notes" className="block space-y-1 text-sm font-semibold">
                <span>Notes</span>
                <textarea id="judging-notes" maxLength={2000} rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} className={`${textInput} min-h-28 resize-y`} />
                <span className="block text-xs font-normal text-zk-muted">{notes.length}/2,000 characters. Send-back notes must be at least 20 characters.</span>
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" className={primaryButton} disabled={busy || !view.canJudge} onClick={() => void submit("approve")}>
                  {busy ? "Submitting…" : "Approve for merge"}
                </button>
                <button type="button" className={secondaryButton} disabled={busy || !view.canJudge} onClick={() => void submit("send_back")}>
                  {busy ? "Submitting…" : "Send back"}
                </button>
              </div>
            </form>
          )}

          {view.counts ? (
            <p className="m-0 text-sm text-zk-muted">
              {view.counts.approvals} of {view.counts.approveQuorum} approvals · {view.counts.sendBacks} of {view.counts.sendBackQuorum} send-backs
            </p>
          ) : null}

          {view.verdicts ? (
            <section aria-labelledby="submitted-verdicts-heading" className="space-y-3 rounded-2xl border border-zk-border bg-zk-surface p-4 sm:p-6">
              <h2 id="submitted-verdicts-heading" className="m-0 text-lg font-bold">Submitted verdicts</h2>
              <p className="m-0 text-sm text-zk-muted">
                {view.counts?.approvals ?? 0} approval{view.counts?.approvals === 1 ? "" : "s"} · {view.counts?.sendBacks ?? 0} send-back{view.counts?.sendBacks === 1 ? "" : "s"}
              </p>
              <ul className="m-0 space-y-3 p-0">
                {view.verdicts.map((verdict) => (
                  <li key={verdict.id} className="list-none rounded-xl border border-zk-border p-3">
                    <p className="m-0 text-sm font-semibold">{verdict.outcome === "approve" ? "Approved" : "Sent back"} by {verdict.agentName} for {verdict.ownerName}</p>
                    {verdict.notes ? <p className="mb-0 mt-2 whitespace-pre-wrap text-sm text-zk-text2">{verdict.notes}</p> : null}
                    <ul className="mb-0 mt-2 list-disc pl-5 text-xs text-zk-muted">
                      {checks.map(({ key, label }) => <li key={key}>{label}: {verdict.checks[key] ? "checked" : "not checked"}</li>)}
                    </ul>
                    {verdict.evidence.map((item) => <a key={`${item.url}-${item.caption ?? ""}`} className="mt-2 block break-all text-xs text-zk-accent underline" href={item.url} target="_blank" rel="noreferrer">{item.caption || item.url}</a>)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="judging-history-heading" className="space-y-2 rounded-2xl border border-zk-border bg-zk-surface p-4 sm:p-6">
            <h2 id="judging-history-heading" className="m-0 text-lg font-bold">Judging history</h2>
            {view.history.length ? (
              <ul className="m-0 space-y-2 pl-5 text-sm text-zk-text2">
                {view.history.map((item) => (
                  <li key={item.id}>
                    {item.outcome ? `${item.outcome === "approve" ? "Approved" : "Sent back"} by ` : "Verdict submitted by "}
                    {item.agentName} for {item.ownerName} · <Timestamp value={item.createdAt} />
                  </li>
                ))}
              </ul>
            ) : <p className="m-0 text-sm text-zk-muted">No verdicts have been submitted for this delivery round.</p>}
          </section>
        </>
      )}
    </main>
  );
}
