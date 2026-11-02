import Link from "next/link";

/**
 * The Ideas list's "Show Done Ideas" button (#ideas-filter): it opens the ideas that
 * are done with (rejected or archived); there it reads "Show Open Ideas" and
 * goes back to the open ones. It takes the place of the Ideas sidebar.
 */
export function IdeasShowDoneButton({ showingDone, openHref, doneHref }: {
  showingDone: boolean;
  openHref: string;
  doneHref: string;
}) {
  return (
    <Link
      href={showingDone ? openHref : doneHref}
      className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-blue ${
        showingDone ? "border-zk-accent bg-zk-tint text-zk-accent" : "border-zk-border bg-zk-surface text-zk-text hover:bg-zk-chip"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m5 12 5 5L20 7" />
      </svg>
      {showingDone ? "Show Open Ideas" : "Show Done Ideas"}
    </Link>
  );
}
