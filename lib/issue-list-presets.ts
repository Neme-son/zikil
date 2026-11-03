import type { Substatus } from "@prisma/client";
import { STATUS_OF } from "@/lib/issue-substatus";

/**
 * The issue list's preset views (#preset-chips): one-click chips above the
 * list that open a personal view with the usual filters. Each preset names the
 * query params it sets; the list builds its link and counts from this one
 * definition, so the chip's label, address and number can't disagree.
 */

/** `?substatus=`: a list narrowed to one step within a status (e.g. Done · Requires review). */
export const SUBSTATUS_PARAM = "substatus";

/** The `?substatus=` value, when it names a real substatus (#substatus). */
export function parseSubstatusFilter(raw: string | string[] | null | undefined): Substatus | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string") return null;
  return value in STATUS_OF ? (value as Substatus) : null;
}

export type IssuePresetId = "my-open" | "needs-review" | "awaiting-confirmation";

export type IssuePreset = {
  id: IssuePresetId;
  label: string;
  /** What the preset shows, on hover and for screen readers. */
  description: string;
  /**
   * Query params the preset's link sets on the list URL. The list resets
   * paging, the intake stage, the substatus and the mine filter first, so
   * each preset opens the same view whatever was picked before.
   */
  params: Record<string, string>;
};

export const ISSUE_PRESETS: readonly IssuePreset[] = [
  {
    id: "my-open",
    label: "My open",
    description: "Open issues you reported, are assigned to, or are bidding on.",
    params: { status: "open", mine: "involved" },
  },
  {
    id: "needs-review",
    label: "Needs my review",
    description: "Delivered work waiting for a test verdict.",
    params: { status: "done", substatus: "requires_review" },
  },
  {
    id: "awaiting-confirmation",
    label: "Awaiting confirmation",
    description: "Open issues still being confirmed as real and not duplicates.",
    params: { status: "all", stage: "confirming" },
  },
];
