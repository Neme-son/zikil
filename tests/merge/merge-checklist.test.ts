import { describe, expect, it } from "vitest";
import { mergeChecklist, type ChecklistIssue } from "@/lib/merge-checklist";
import type { GateReport } from "@/lib/agent-api/pr-gate";

/** The ready-to-merge checklist (#merge-checklist): each line from the latest pull request report. */
const PR = "https://github.com/emerjent/ziki/pull/552";
const NOW = new Date("2026-11-05T12:00:00Z").getTime();
const issue = (over: Partial<ChecklistIssue> = {}): ChecklistIssue => ({
  pullRequestUrl: PR,
  pullRequestHeadSha: "aaa1111bbb",
  repo: { owner: "emerjent", repo: "ziki" },
  ...over,
});
const report = (over: Partial<GateReport & { createdAt: Date }> = {}): GateReport & { createdAt: Date } => ({
  pullRequestUrl: PR,
  state: "open",
  mergedInto: null,
  inDefaultBranch: null,
  headSha: "aaa1111bbb",
  checks: "passing",
  mergeable: true,
  createdAt: new Date(NOW - 30 * 60_000),
  ...over,
});
const state = (list: ReturnType<typeof mergeChecklist>, key: string) => list.items.find((item) => item.key === key)?.state;

describe("mergeChecklist", () => {
  it("is ready when every line passes", () => {
    const list = mergeChecklist(report(), issue(), NOW);
    expect(list.verdict).toBe("ready");
    expect(list.passed).toBe(6);
    expect(list.total).toBe(6);
    expect(list.headline).toBe("Ready for a good-to-merge judgement.");
    expect(list.items.every((item) => item.detail === null)).toBe(true);
  });

  it("waits for a report when nobody checked the pull request", () => {
    const list = mergeChecklist(null, issue(), NOW);
    expect(list.verdict).toBe("waiting");
    expect(list.passed).toBe(1); // the link itself is in the project's repository
    expect(list.headline).toBe("Waiting for an agent to check the pull request on GitHub.");
    expect(list.reportedAt).toBeNull();
  });

  it("ignores a report on another pull request", () => {
    const list = mergeChecklist(report({ pullRequestUrl: "https://github.com/emerjent/ziki/pull/1" }), issue(), NOW);
    expect(state(list, "open")).toBe("wait");
    expect(list.reportedAt).toBeNull();
  });

  it("blocks on failing checks and says why first", () => {
    const list = mergeChecklist(report({ checks: "failing" }), issue(), NOW);
    expect(list.verdict).toBe("blocked");
    expect(state(list, "checks")).toBe("fail");
    expect(list.headline).toBe("Not ready: Checks are failing.");
  });

  it("waits while checks are running, and counts no checks as green", () => {
    expect(state(mergeChecklist(report({ checks: "pending" }), issue(), NOW), "checks")).toBe("wait");
    expect(state(mergeChecklist(report({ checks: "none" }), issue(), NOW), "checks")).toBe("pass");
    expect(mergeChecklist(report({ checks: "pending" }), issue(), NOW).headline).toBe("Waiting on 1 check.");
  });

  it("blocks on merge conflicts", () => {
    const list = mergeChecklist(report({ mergeable: false }), issue(), NOW);
    expect(state(list, "conflicts")).toBe("fail");
    expect(list.verdict).toBe("blocked");
  });

  it("blocks when the head moved after the check", () => {
    const list = mergeChecklist(report({ headSha: "ccc2222ddd" }), issue(), NOW);
    expect(state(list, "head")).toBe("fail");
    expect(list.items.find((item) => item.key === "head")?.detail).toBe("Head moved: checked ccc2222, delivered aaa1111");
  });

  it("blocks a closed, merged or missing pull request", () => {
    expect(state(mergeChecklist(report({ state: "closed" }), issue(), NOW), "open")).toBe("fail");
    expect(state(mergeChecklist(report({ state: "merged" }), issue(), NOW), "open")).toBe("fail");
    expect(state(mergeChecklist(report({ state: "not_found" }), issue(), NOW), "open")).toBe("fail");
  });

  it("blocks a link outside the project's repository", () => {
    const list = mergeChecklist(report(), issue({ repo: { owner: "zeduchat", repo: "zedu-desktop" } }), NOW);
    expect(state(list, "repository")).toBe("fail");
    expect(list.verdict).toBe("blocked");
  });

  it("asks for a fresh check once the report is old", () => {
    const list = mergeChecklist(report({ createdAt: new Date(NOW - 8 * 3_600_000) }), issue(), NOW);
    expect(state(list, "fresh")).toBe("wait");
    expect(list.items.find((item) => item.key === "fresh")?.detail).toBe("Last checked 8 hours ago");
    expect(list.verdict).toBe("waiting");
  });
});
