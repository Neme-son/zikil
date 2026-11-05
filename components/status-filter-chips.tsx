import Link from "next/link";

export type StatusFilterChip = {
  label: string;
  count: number;
  href: string;
  selected: boolean;
};

// Close to the rows' status chips (components/idea-path.tsx), but built as
// buttons: a solid border, a slight shadow, and a press. The selected filter is
// blue, like the current step.
const chip =
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[7px] border px-[6px] font-mono text-[10px] font-semibold shadow-[0_1px_1px_rgba(11,23,51,0.08)] transition-colors active:translate-y-px active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-electric-blue";
const selectedTone = "border-blue-300 bg-blue-50 text-blue-700";
const otherTone = "border-zk-border bg-zk-surface text-zk-text2 hover:border-zk-muted hover:bg-zk-chip hover:text-zk-text";

/** A small "Filter" label above one chip per status in the current section, for a list's header row. */
export function StatusFilterChips({ filters, more }: {
  filters: StatusFilterChip[];
  /** A widget to the right of the chips, e.g. more filters. */
  more?: React.ReactNode;
}) {
  return (
    <nav aria-label="Filter by status" className="flex flex-col items-start gap-0.5">
      <span className="text-[9px] font-medium uppercase leading-none tracking-wide text-zk-muted">Filter</span>
      <span className="flex items-center gap-[3px]">
        {filters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            aria-current={filter.selected ? "page" : undefined}
            className={`${chip} ${filter.selected ? selectedTone : otherTone}`}
          >
            {filter.label}
            <span className="font-normal tabular-nums opacity-70">{filter.count}</span>
          </Link>
        ))}
        {more}
      </span>
    </nav>
  );
}
