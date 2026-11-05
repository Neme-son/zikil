/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MergeChecklistCard, MANUAL_CHECKS } from "@/components/merge-checklist";
import { mergeChecklist } from "@/lib/merge-checklist";

/** The ready-to-merge checklist card in the issue's side rail (#merge-checklist). */
const PR = "https://github.com/emerjent/ziki/pull/552";
const NOW = new Date("2026-11-05T12:00:00Z").getTime();
const issue = { pullRequestUrl: PR, pullRequestHeadSha: "aaa1111", repo: { owner: "emerjent", repo: "ziki" } };
const report = (over: Record<string, unknown> = {}) => ({
  pullRequestUrl: PR,
  state: "open" as const,
  mergedInto: null,
  inDefaultBranch: null,
  headSha: "aaa1111",
  checks: "passing",
  mergeable: true,
  createdAt: new Date(NOW - 60_000),
  ...over,
});

afterEach(() => cleanup());

describe("MergeChecklistCard", () => {
  it("shows the count, the headline and every check", () => {
    render(<MergeChecklistCard checklist={mergeChecklist(report({ checks: "failing" }), issue, NOW)} />);
    const card = screen.getByTestId("merge-checklist");
    expect(within(card).getByRole("heading", { name: "Ready-to-merge checklist" })).toBeTruthy();
    expect(within(card).getByText("5 / 6")).toBeTruthy();
    expect(screen.getByTestId("merge-checklist-headline").textContent).toBe("Not ready: Checks are failing.");
    expect(within(card).getAllByRole("img", { name: "Failed" })).toHaveLength(1);
    expect(within(card).getAllByRole("img", { name: "Passed" })).toHaveLength(5);
    for (const check of MANUAL_CHECKS) expect(within(card).getByText(check)).toBeTruthy();
  });

  it("reports progress to assistive technology", () => {
    render(<MergeChecklistCard checklist={mergeChecklist(report(), issue, NOW)} />);
    const bar = screen.getByRole("progressbar", { name: "Checks passed" });
    expect(bar.getAttribute("aria-valuenow")).toBe("6");
    expect(bar.getAttribute("aria-valuemax")).toBe("6");
    expect(screen.getByTestId("merge-checklist-headline").textContent).toBe("Ready for a good-to-merge judgement.");
  });
});
