import type { WorkFeed, WorkItem } from "@/lib/agent-api/work";

/**
 * Paging and filtering for the work feed (#863). With none of these parameters the feed is the whole list, as
 * before. With any of them it is filtered, then cut to a page, and `page` says how much is left.
 *
 * - `limit`: items per page, 0 to 500. `0` returns no items: the counts, `waiting` and `ask` only.
 * - `after`: the `key` of the last item of the previous page (`page.nextCursor`).
 * - `kind`: one or more item kinds, comma-separated. A kind that matches nothing returns nothing.
 * - `canAct`: `true` for what this agent can do now, `false` for what waits on someone else.
 *
 * `counts` and `waiting` always describe the whole feed, not the page.
 */
export const WORK_PAGE_MAX = 500;

export type WorkPageQuery = { limit: number | null; after: string | null; kinds: string[] | null; canAct: boolean | null };
export type WorkPageInfo = { total: number; returned: number; hasMore: boolean; nextCursor: string | null };

export type WorkPageParse = { ok: true; query: WorkPageQuery | null } | { ok: false; field: string; message: string };

export function parseWorkPageQuery(params: URLSearchParams): WorkPageParse {
  const limitRaw = params.get("limit");
  const after = params.get("after");
  const kindRaw = params.get("kind");
  const canActRaw = params.get("canAct");
  if (limitRaw === null && after === null && kindRaw === null && canActRaw === null) return { ok: true, query: null };

  let limit: number | null = null;
  if (limitRaw !== null) {
    if (!/^\d{1,3}$/.test(limitRaw) || Number(limitRaw) > WORK_PAGE_MAX) {
      return { ok: false, field: "limit", message: `limit is a whole number from 0 to ${WORK_PAGE_MAX}.` };
    }
    limit = Number(limitRaw);
  }
  let canAct: boolean | null = null;
  if (canActRaw !== null) {
    if (canActRaw !== "true" && canActRaw !== "false") return { ok: false, field: "canAct", message: "canAct is true or false." };
    canAct = canActRaw === "true";
  }
  const kinds = kindRaw === null ? null : kindRaw.split(",").map((kind) => kind.trim()).filter(Boolean);
  if (kinds && kinds.length === 0) return { ok: false, field: "kind", message: "kind is one or more item kinds, comma-separated." };
  return { ok: true, query: { limit, after, kinds, canAct } };
}

export function pageWorkFeed(feed: WorkFeed, query: WorkPageQuery | null): WorkFeed & { page?: WorkPageInfo } {
  if (!query) return feed;
  let items: WorkItem[] = feed.items;
  if (query.kinds) items = items.filter((item) => query.kinds!.includes(item.kind));
  if (query.canAct !== null) items = items.filter((item) => item.canAct === query.canAct);
  const total = items.length;
  if (query.after !== null) {
    const index = items.findIndex((item) => item.key === query.after);
    if (index < 0) throw new WorkCursorError();
    items = items.slice(index + 1);
  }
  const limit = query.limit ?? items.length;
  const shown = items.slice(0, limit);
  const hasMore = shown.length < items.length;
  return {
    ...feed,
    items: shown,
    page: { total, returned: shown.length, hasMore, nextCursor: hasMore && shown.length > 0 ? shown[shown.length - 1].key : null },
  };
}

/** `after` named an item that is not in the filtered list: the feed moved on, or the cursor is wrong. */
export class WorkCursorError extends Error {
  constructor() {
    super("after is not an item key in this feed. Read the first page again.");
  }
}
