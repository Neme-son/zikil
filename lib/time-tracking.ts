/**
 * Issue time tracking (#time-tracking, #auto-time): time is tracked
 * automatically from status transitions and browser heartbeats. Entries are
 * system-generated; the manual entry form has been removed.
 */

/** The most one entry may record: a full day. */
export const MAX_TIME_ENTRY_MINUTES = 24 * 60;

/** Cap per auto-tracked session to prevent inflated time (e.g. left in progress over a weekend). */
export const MAX_AUTO_SESSION_MINUTES = 8 * 60;

/** Heartbeat interval in milliseconds (5 minutes). */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/** How this entry was created. */
export type TimeEntrySource = "auto" | "manual";

/** Whether a value is a whole number of minutes in the allowed range. */
export function isValidMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_TIME_ENTRY_MINUTES
  );
}

/** Read minutes from a form field (kept for admin corrections). */
export function parseMinutesInput(raw: unknown): number | null {
  if (typeof raw === "number") return isValidMinutes(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || !/^\d+$/.test(text)) return null;
  const value = Number(text);
  return isValidMinutes(value) ? value : null;
}

/** Human duration: 0m, 45m, 1h, 1h 30m, 24h. */
export function formatDuration(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Total minutes across entries. */
export function sumMinutes(entries: ReadonlyArray<{ minutes: number }>): number {
  return entries.reduce((total, entry) => total + (Number.isFinite(entry.minutes) ? entry.minutes : 0), 0);
}

/** Cap a session's elapsed minutes to the auto-session max. */
export function capSessionMinutes(elapsed: number): number {
  return Math.min(Math.max(0, Math.floor(elapsed)), MAX_AUTO_SESSION_MINUTES);
}

/** Format an auto-tracked entry note. */
export function autoEntryNote(activeMinutes: number, totalMinutes: number): string {
  if (activeMinutes === totalMinutes || activeMinutes === 0) {
    return `Auto-tracked: ${formatDuration(totalMinutes)}`;
  }
  return `Auto-tracked: ${formatDuration(activeMinutes)} active of ${formatDuration(totalMinutes)} total`;
}
