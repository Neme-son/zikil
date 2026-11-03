import type { ReactNode } from "react";

/**
 * Shared layout for the error, not-found and session pages (#214): a short
 * explanation and the actions that get the person moving again. 404 pages
 * pass the robot illustration so "nothing here" looks like every other empty
 * state; error pages stay text-only.
 */
export function StatusPage({
  code,
  title,
  children,
  actions,
  illustration,
}: {
  code?: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center sm:py-24">
      {illustration ?? null}
      {code ? (
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-zk-accent" aria-hidden="true">
          {code}
        </p>
      ) : null}
      <h1 className="text-2xl font-extrabold tracking-tight text-zk-text">{title}</h1>
      <div className="space-y-2 text-sm leading-6 text-zk-text2">{children}</div>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">{actions}</div>
    </div>
  );
}

export const primaryActionClass =
  "inline-flex items-center justify-center rounded-full bg-electric-blue-strong px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2";

export const secondaryActionClass =
  "inline-flex items-center justify-center rounded-full border border-zk-border bg-zk-surface px-3.5 py-2 text-sm font-medium text-zk-text transition hover:bg-zk-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2";
