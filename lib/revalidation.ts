/**
 * Issue revalidation (#revalidation): the rules for telling when a code change
 * touches an issue's area, and what a re-check may answer.
 *
 * A bug report describes code that moves. An agent records the issue's repro
 * profile (the files and endpoints it lives in, how to see it, the commit it
 * was seen on), and later a change to those places asks for a re-check instead
 * of letting the report go stale.
 *
 * Ziki never calls GitHub (see AGENTS.md): an agent reports the changed paths
 * it saw, and this module decides which issues that touches. Everything here
 * is pure, so the same rule can be used by the API, the work feed and the
 * issue page.
 */

/** The four answers a re-check gives. */
export const REVALIDATION_VERDICTS = [
  "still_reproducible",
  "possibly_fixed",
  "no_longer_reproducible",
  "feature_removed",
] as const;

export type RevalidationVerdict = (typeof REVALIDATION_VERDICTS)[number];

/** How each answer reads on the issue page and in the work feed. */
export const REVALIDATION_VERDICT_LABELS: Record<RevalidationVerdict, string> = {
  still_reproducible: "Still reproducible",
  possibly_fixed: "Possibly fixed",
  no_longer_reproducible: "No longer reproducible",
  feature_removed: "Feature no longer in use",
};

/** What each answer means, in the words an agent acts on. */
export const REVALIDATION_VERDICT_MEANINGS: Record<RevalidationVerdict, string> = {
  still_reproducible: "It still happens on the code today, following the same steps.",
  possibly_fixed: "The change looks like it addressed it, but nobody has seen it fixed yet.",
  no_longer_reproducible: "The steps no longer reproduce anything on the code today.",
  feature_removed: "The feature the report described is gone, so the report is obsolete.",
};

/** Whether the answer says the bug is still around (a person may keep it open). */
export function stillBroken(verdict: RevalidationVerdict | null | undefined): boolean {
  return verdict === "still_reproducible" || verdict === "possibly_fixed";
}

export type RevalidationTrigger = "pull_request" | "commit" | "manual";

export const REVALIDATION_TRIGGERS: RevalidationTrigger[] = ["pull_request", "commit", "manual"];

/** Where a re-check came from, for the issue page. */
export const REVALIDATION_TRIGGER_LABELS: Record<RevalidationTrigger, string> = {
  pull_request: "Pull request",
  commit: "Commit",
  manual: "Re-check by hand",
};

// ---------------------------------------------------------------------------
// Matching a change against an issue's area
// ---------------------------------------------------------------------------

/**
 * A path or endpoint as the matcher compares it: forward slashes (agents on
 * Windows report `\`), no `./` or leading `/`, no empty segments, lowercase.
 * Rule text is compared on segment boundaries, never by `startsWith`, so
 * `app/api/v1/issue` must not match `app/api/v1/issues`.
 */
export function normalizeArea(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

/** A segment that stands for a value rather than a name: `:id`, `[id]`, `{id}`, `123`, a uuid. */
export function isDynamicSegment(segment: string): boolean {
  const s = segment.trim().toLowerCase();
  if (!s) return false;
  if (/^[:{[]/.test(s) || s === "*" || s === "**") return true;
  if (/^\d+$/.test(s)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
}

/**
 * The part of an endpoint that names an area: its method and dynamic segments
 * dropped. `POST /api/v1/issues/:id/importance` → `api/v1/issues`. An issue
 * that names an endpoint is touched when a change lands anywhere under it.
 */
export function endpointArea(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/^[a-z]+\s+/i, "");
  const segments = normalizeArea(trimmed).split("/").filter(Boolean);
  const area: string[] = [];
  for (const segment of segments) {
    if (isDynamicSegment(segment)) break;
    area.push(segment);
  }
  return area.join("/");
}

/** A segment matches literally, or through `*` (any run of characters). */
function segmentMatches(pattern: string, segment: string): boolean {
  if (pattern === segment) return true;
  if (!pattern.includes("*")) return false;
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`).test(segment);
}

/**
 * Whether a changed file is in the area an agent named.
 *
 * The area is matched on whole segments and may be a file or a directory: a
 * directory matches everything under it (`src/lib/billing`), `**` matches
 * anything from there on (`src/api/` and everything below it), and `*` matches
 * within one segment (`app/` plus one folder plus `page.tsx`).
 */
/** Whether the area's segments match the changed ones from `start` on. */
function matchesFrom(patternSegments: string[], changedSegments: string[], start: number): boolean {
  for (let i = 0; i < patternSegments.length; i++) {
    const segment = patternSegments[i];
    // `**` means "and everything under it".
    if (segment === "**") return true;
    if (start + i >= changedSegments.length) return false;
    if (!segmentMatches(segment, changedSegments[start + i])) return false;
  }
  return true;
}

export function areaMatches(area: string, changedPath: string): boolean {
  const pattern = normalizeArea(area);
  const changed = normalizeArea(changedPath);
  if (!pattern || !changed) return false;
  const patternSegments = pattern.split("/").filter(Boolean);
  const changedSegments = changed.split("/").filter(Boolean);
  if (patternSegments.length === 0 || changedSegments.length === 0) return false;
  return matchesFrom(patternSegments, changedSegments, 0);
}

/**
 * Whether an endpoint's area is part of a changed path. Unlike a repository
 * path, which an agent reports from the root, an endpoint's area appears
 * wherever its route is served from: `POST /api/v1/issues/:id/revalidation`
 * is touched by `app/api/v1/issues/[id]/revalidation/route.ts`.
 */
export function endpointAreaMatches(area: string, changedPath: string): boolean {
  const pattern = normalizeArea(area);
  const changed = normalizeArea(changedPath);
  if (!pattern || !changed) return false;
  const patternSegments = pattern.split("/").filter(Boolean);
  const changedSegments = changed.split("/").filter(Boolean);
  if (patternSegments.length === 0 || changedSegments.length === 0) return false;
  for (let start = 0; start + patternSegments.length <= changedSegments.length; start++) {
    if (matchesFrom(patternSegments, changedSegments, start)) return true;
  }
  return false;
}

export type ReproArea = {
  affectedPaths: string[];
  affectedEndpoints: string[];
};

/**
 * Which of an issue's areas a change touched, in the issue's own words. An
 * empty answer means the change is somewhere else and the issue is not
 * affected.
 */
export function matchedAreas(repro: ReproArea, changedPaths: string[]): string[] {
  const changed = changedPaths.map(normalizeArea).filter(Boolean);
  if (changed.length === 0) return [];
  const matched: string[] = [];
  for (const path of repro.affectedPaths) {
    if (changed.some((one) => areaMatches(path, one))) matched.push(path);
  }
  for (const endpoint of repro.affectedEndpoints) {
    const area = endpointArea(endpoint);
    if (area && changed.some((one) => endpointAreaMatches(area, one))) matched.push(endpoint);
  }
  return matched;
}

/**
 * Whether a reported pull request is the issue's own fix: re-checking an issue
 * for the change that closes it proves nothing, so it asks for no re-check.
 */
export function ownFix(issuePullRequestUrl: string | null | undefined, reportedPullRequestUrl: string | null | undefined): boolean {
  if (!issuePullRequestUrl || !reportedPullRequestUrl) return false;
  return issuePullRequestUrl.trim().toLowerCase() === reportedPullRequestUrl.trim().toLowerCase();
}

/** The commit a re-check is about, shortened for a heading. */
export function shortSha(sha: string | null | undefined): string {
  if (!sha) return "";
  return sha.trim().slice(0, 7);
}
