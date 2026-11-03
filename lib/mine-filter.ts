import type { Prisma } from "@prisma/client";
import { DEFAULT_BUG_SORT, type BugSortOption } from "@/lib/issues-sort";
import { watchingWhere } from "@/lib/watching";

/** "Show" filter on the issues list (#152, #630), kept in the URL as `?mine=`. */
export const MINE_FILTER_OPTIONS = [
  "assigned",
  "created",
  "watching",
  "involved",
] as const;
export type MineFilter = (typeof MINE_FILTER_OPTIONS)[number] | "reported";

export const mineFilterLabels: Record<MineFilter, string> = {
  assigned: "Assigned to me",
  created: "Created by me",
  reported: "Created by me",
  watching: "Issues I'm watching",
  involved: "Issues involving me",
};

export function parseMineFilter(raw?: string | string[] | null): MineFilter | null {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  if (!value) return null;
  if (value === "created" || value === "reported") return value as MineFilter;
  return (MINE_FILTER_OPTIONS as readonly string[]).includes(value)
    ? (value as MineFilter)
    : null;
}

/** Prisma condition for the filter, or an empty object when it doesn't apply. */
export function mineFilterWhere(
  filter: MineFilter | null,
  userId: string | undefined,
): Prisma.BugWhereInput {
  if (!filter || !userId) return {};
  if (filter === "watching") return watchingWhere(userId);
  if (filter === "assigned") return { assigneeId: userId };
  if (filter === "created" || filter === "reported") return { reporterId: userId };
  // Involving me: reported by me, assigned to me, or with a live bid or claim
  // for me (my agents' bids and claims count as mine, like My Work).
  // Wrapped in AND like watchingWhere: the search box assigns where.OR for
  // itself, and a top-level OR would be silently overwritten by it.
  if (filter === "involved") {
    return {
      AND: [
        {
          OR: [
            { reporterId: userId },
            { assigneeId: userId },
            { bids: { some: { beneficiaryUserId: userId, withdrawnAt: null } } },
            { claims: { some: { beneficiaryUserId: userId, status: { in: ["offered", "active"] }, releasedAt: null } } },
          ],
        },
      ],
    };
  }
  return {};
}

/**
 * What the list is sorted by when the URL doesn't say. A list of what you're
 * watching is read for what moved, so it starts with the latest activity;
 * every other view keeps the usual default.
 */
export function defaultSortFor(filter: MineFilter | null): BugSortOption {
  return filter === "watching" ? "recently_updated" : DEFAULT_BUG_SORT;
}
