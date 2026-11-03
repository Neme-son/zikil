import Link from "next/link";

export type IssuePresetChip = {
  label: string;
  count: number;
  href: string;
  selected: boolean;
  description: string;
};

const chip =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-blue";
const selectedTone = "border-transparent bg-electric-blue-strong text-white shadow-[0_8px_20px_rgba(46,111,239,0.30)]";
const otherTone = "border-zk-border bg-zk-surface text-zk-text2 hover:border-zk-muted hover:bg-zk-chip hover:text-zk-text";
const countTone = "font-normal tabular-nums opacity-70";

/**
 * The issue list's preset views (#preset-chips): one pill per personal view,
 * with its count. The selected preset is filled blue and links back to the
 * plain All list, so a second click clears it.
 */
export function IssuePresetChips({ chips }: { chips: IssuePresetChip[] }) {
  if (chips.length === 0) return null;
  return (
    <nav aria-label="Preset views" className="flex flex-wrap items-center gap-2">
      {chips.map((chipItem) => (
        <Link
          key={chipItem.label}
          href={chipItem.href}
          aria-current={chipItem.selected ? "true" : undefined}
          title={chipItem.description}
          className={`${chip} ${chipItem.selected ? selectedTone : otherTone}`}
        >
          {chipItem.label}
          <span className={countTone} aria-label={`${chipItem.count} ${chipItem.count === 1 ? "issue" : "issues"}`}>
            {chipItem.count}
          </span>
        </Link>
      ))}
    </nav>
  );
}
