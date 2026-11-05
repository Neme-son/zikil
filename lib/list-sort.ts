import type { Prisma } from "@prisma/client";

/**
 * Sorting by the list's column headers (#column-sort). The choice is in the
 * address (`?sort=`) and remembered in a cookie per list, so the list keeps the
 * order you picked when you come back. The address wins over the cookie.
 */
export const ISSUE_SORT_COOKIE = "ziki-issue-sort";
export const IDEA_SORT_COOKIE = "ziki-idea-sort";
/** A year: the choice lasts until you pick another. */
export const SORT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const IDEA_SORT_OPTIONS = ["score", "score_asc", "title", "title_desc", "updated", "updated_asc"] as const;
export type IdeaSortOption = (typeof IDEA_SORT_OPTIONS)[number];
export const DEFAULT_IDEA_SORT: IdeaSortOption = "score";

export function parseIdeaSort(raw: string | string[] | null | undefined, fallback: IdeaSortOption = DEFAULT_IDEA_SORT): IdeaSortOption {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (IDEA_SORT_OPTIONS as readonly string[]).includes(value ?? "") ? (value as IdeaSortOption) : fallback;
}

/** The database order for an ideas sort; ties fall back to newest first. */
export function getIdeaOrderBy(sort: IdeaSortOption): Prisma.IdeaOrderByWithRelationInput[] {
  switch (sort) {
    case "score":
      return [{ score: "desc" }, { createdAt: "desc" }, { id: "desc" }];
    case "score_asc":
      return [{ score: "asc" }, { createdAt: "desc" }, { id: "desc" }];
    case "title":
      return [{ title: "asc" }, { id: "asc" }];
    case "title_desc":
      return [{ title: "desc" }, { id: "desc" }];
    case "updated":
      return [{ updatedAt: "desc" }, { id: "desc" }];
    case "updated_asc":
      return [{ updatedAt: "asc" }, { id: "asc" }];
  }
}
