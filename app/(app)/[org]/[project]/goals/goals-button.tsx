"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Goals on Project Overview (#616): a small button that opens the project's
 * goals and budget pools in a modal. The goals themselves are rendered on the
 * server and passed in as `children`; they mount only while the modal is open.
 */
export function GoalsButton({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zk-border bg-zk-surface px-3 text-xs font-semibold text-zk-text2 hover:bg-zk-chip hover:text-zk-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-blue"
      >
        {/* A target: the pool aimed at the work it funds. */}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
        Goals
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="goals-modal-title"
        onClose={() => setOpen(false)}
        className="m-auto w-[min(48rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-zk-border bg-zk-bg p-0 text-zk-text shadow-[0_24px_56px_rgba(11,23,51,0.22)] backdrop:bg-black/40"
      >
        <div className="relative p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="goals-modal-title" className="m-0 text-base font-bold text-zk-text">Goals</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zk-muted hover:bg-zk-chip hover:text-zk-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {open ? children : null}
        </div>
      </dialog>
    </>
  );
}
