import type {
  SecurityCheckItemKind,
  SecurityCheckItemStatus,
  SecurityCheckStatus,
  SecurityTargetKind,
} from "@prisma/client";

/**
 * Shared words for security checks (#security-checks): a client adds a
 * website, server or repo, proves it is theirs, and agents check it and
 * report problems. Plain data with no server imports, so pages and API routes
 * use the same names. The flow and who owns which part: docs/security-checks.md.
 */

/** What one check costs, in coins. A placeholder until coins are real. */
export const SECURITY_CHECK_PRICE_COINS = 50;

export const SECURITY_TARGET_KINDS = ["website", "server", "repo"] as const satisfies readonly SecurityTargetKind[];

export const TARGET_KIND_LABEL: Record<SecurityTargetKind, string> = {
  website: "Website",
  server: "Server",
  repo: "Code repository",
};

/** In flow order. */
export const SECURITY_CHECK_STATUSES = [
  "awaiting_ownership",
  "queued",
  "splitting",
  "checking",
  "done",
  "cancelled",
] as const satisfies readonly SecurityCheckStatus[];

/** What the client reads; never agent names or internals. */
export const CHECK_STATUS_LABEL: Record<SecurityCheckStatus, string> = {
  awaiting_ownership: "Show it's yours",
  queued: "Waiting to start",
  splitting: "Planning the checks",
  checking: "Checking",
  done: "Done",
  cancelled: "Cancelled",
};

export const SECURITY_CHECK_ITEM_KINDS = ["split", "check"] as const satisfies readonly SecurityCheckItemKind[];

export const SECURITY_CHECK_ITEM_STATUSES = ["waiting", "checking", "done", "skipped"] as const satisfies readonly SecurityCheckItemStatus[];

export const ITEM_STATUS_LABEL: Record<SecurityCheckItemStatus, string> = {
  waiting: "Waiting",
  checking: "Checking",
  done: "Done",
  skipped: "Skipped",
};

/** A check that will not change any more. */
export const FINISHED_CHECK_STATUSES: ReadonlySet<SecurityCheckStatus> = new Set(["done", "cancelled"]);

/** Agents may work on a check only in these states: ownership is proven and it is not finished. */
export const AGENT_WORKABLE_CHECK_STATUSES: ReadonlySet<SecurityCheckStatus> = new Set(["queued", "splitting", "checking"]);

export function isSecurityTargetKind(value: unknown): value is SecurityTargetKind {
  return typeof value === "string" && (SECURITY_TARGET_KINDS as readonly string[]).includes(value);
}

export function isSecurityCheckStatus(value: unknown): value is SecurityCheckStatus {
  return typeof value === "string" && (SECURITY_CHECK_STATUSES as readonly string[]).includes(value);
}

export function isSecurityCheckItemStatus(value: unknown): value is SecurityCheckItemStatus {
  return typeof value === "string" && (SECURITY_CHECK_ITEM_STATUSES as readonly string[]).includes(value);
}

/** Whether agents may touch this check's target: never before ownership is proven. */
export function agentsMayWork(check: { status: SecurityCheckStatus }, target: { verifiedAt: Date | null }): boolean {
  return target.verifiedAt !== null && AGENT_WORKABLE_CHECK_STATUSES.has(check.status);
}

/** Whether the client sees the full report (and agents get paid): only once paid. */
export function isCheckPaid(check: { paidAt: Date | null }): boolean {
  return check.paidAt !== null;
}
