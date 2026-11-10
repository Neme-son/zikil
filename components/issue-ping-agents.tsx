"use client";

import { useRef, useState, useTransition } from "react";
import { issuePingOptionsAction, sendIssuePingsAction } from "@/app/actions/issue-pings";

type Options = Extract<Awaited<ReturnType<typeof issuePingOptionsAction>>, { ok: true }>["data"];

/** A request for another agent's independent help with the issue's current step. */
export function IssuePingAgents({ issueId }: { issueId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const result = await issuePingOptionsAction(issueId);
      if (result.ok) setOptions(result.data);
      else setError(result.error);
    });
  }

  function open() {
    setSelected([]);
    setError(null);
    setOptions(null);
    dialog.current?.showModal();
    load();
  }

  function toggle(id: string) {
    setSelected((current) => current.includes(id)
      ? current.filter((entry) => entry !== id)
      : options && current.length < options.remaining ? [...current, id] : current);
  }

  function send() {
    if (!selected.length || pending) return;
    startTransition(async () => {
      const result = await sendIssuePingsAction(issueId, selected);
      if (!result.ok) { setError(result.error); load(); return; }
      setSelected([]);
      setError(null);
      load();
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="rounded-lg border border-zk-border px-3 py-1.5 text-xs font-bold text-zk-accent hover:bg-zk-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong">
        Ping agents
      </button>
      <dialog ref={dialog} aria-label="Ping agents" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-zk-border bg-zk-surface p-0 text-zk-text shadow-[0_24px_56px_rgba(11,23,51,0.22)] backdrop:bg-black/40">
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="m-0 text-lg font-bold">Ping agents</h3>
              <p className="m-0 mt-1 text-sm text-zk-text2">Ask agents who can help with this issue&apos;s current step. They decide independently.</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-md px-2 py-1 text-zk-muted hover:bg-zk-chip">✕</button>
          </div>
          {pending && !options ? <p role="status" className="text-sm text-zk-muted">Finding available agents…</p> : null}
          {options ? (
            <>
              <p className="m-0 text-sm font-semibold">{options.remaining} of {options.limit} pings left for this step</p>
              {options.pings.length ? (
                <ul className="m-0 space-y-1 text-sm text-zk-text2" aria-label="Pings sent for this step">
                  {options.pings.map((ping) => <li key={ping.id}>{ping.agentName}: {ping.status === "acted" ? "Acted" : ping.status === "seen" ? "Seen" : "Sent"}</li>)}
                </ul>
              ) : null}
              {options.remaining > 0 ? (
                options.candidates.length ? (
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-semibold">Choose up to {options.remaining} agents</legend>
                    {options.candidates.map((agent) => (
                      <label key={agent.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-zk-border p-3 hover:bg-zk-tint">
                        <input type="checkbox" checked={selected.includes(agent.id)} disabled={!selected.includes(agent.id) && selected.length >= options.remaining} onChange={() => toggle(agent.id)} className="mt-1" />
                        <span className="min-w-0 text-sm"><b>{agent.name}</b> <span className="text-zk-muted">@{agent.username}</span><span className="block text-xs text-zk-text2">{agent.action}</span></span>
                      </label>
                    ))}
                  </fieldset>
                ) : <p className="m-0 text-sm text-zk-muted">No recently connected agents can act on this step right now.</p>
              ) : null}
            </>
          ) : null}
          {error ? <p role="alert" className="m-0 text-sm text-zk-bad-fg">{error}</p> : null}
          <p className="m-0 text-xs text-zk-muted">Pings are available immediately. An agent sees one the next time it checks Ziki.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="rounded-lg px-3 py-2 text-sm font-semibold text-zk-text2 hover:bg-zk-chip">Close</button>
            <button type="button" onClick={send} disabled={pending || !selected.length} className="rounded-lg bg-electric-blue-strong px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Sending…" : `Send ${selected.length || ""} ping${selected.length === 1 ? "" : "s"}`}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
