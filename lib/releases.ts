/**
 * Release notes built from resolved issues (#872): the issues that went Live, newest day first, each with where it
 * is deployed. The date is when its pull request was reported merged, else when the issue last changed. Pure, so the
 * page stays a view.
 */
export type ReleaseRow = {
  id: string;
  number: number;
  title: string;
  /** "on_dev", "on_staging" or "on_prod". */
  substatus: string;
  typeName: string | null;
  pullRequestUrl: string | null;
  /** When it went in: the merge report's time, else the issue's last change. */
  at: Date;
};

export type ReleaseDay = { day: string; items: ReleaseRow[] };

const WHERE: Record<string, string> = { on_dev: "On dev", on_staging: "On staging", on_prod: "On prod" };

/** "On dev", "On staging" or "On prod"; "Live" for any other live step. */
export function releaseWhere(substatus: string): string {
  return WHERE[substatus] ?? "Live";
}

/** The UTC day, `2026-11-07`, a release is filed under. */
export function releaseDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Groups by day, newest day first, newest first within the day, ties broken by issue number. */
export function groupReleases(rows: readonly ReleaseRow[]): ReleaseDay[] {
  const byDay = new Map<string, ReleaseRow[]>();
  for (const row of rows) {
    const day = releaseDay(row.at);
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, items]) => ({
      day,
      items: [...items].sort((a, b) => b.at.getTime() - a.at.getTime() || b.number - a.number),
    }));
}
