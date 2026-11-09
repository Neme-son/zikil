import { describe, expect, it } from "vitest";
import { generateReleaseNotes, groupIssuesByType, validateReleaseTitle } from "@/lib/release-notes";

describe("release notes", () => {
  it("validates release titles", () => {
    expect(validateReleaseTitle("v1.0.0").ok).toBe(true);
    expect(validateReleaseTitle("").ok).toBe(false);
    expect(validateReleaseTitle("x".repeat(101)).ok).toBe(false);
  });

  it("groups issues by type", () => {
    const issues = [
      { number: 1, title: "Add login", type: "feature", status: "resolved" },
      { number: 2, title: "Fix crash", type: "bug", status: "resolved" },
      { number: 3, title: "Update docs", type: "docs", status: "resolved" },
    ];
    const groups = groupIssuesByType(issues);
    expect(groups.length).toBe(3);
    expect(groups[0].heading).toBe("Features");
    expect(groups[0].items).toContain("- #1 Add login");
  });

  it("generates markdown release notes", () => {
    const issues = [
      { number: 1, title: "Add login", type: "feature", status: "resolved" },
      { number: 2, title: "Fix crash", type: "bug", status: "resolved" },
    ];
    const notes = generateReleaseNotes("v1.0.0", issues);
    expect(notes).toContain("# v1.0.0");
    expect(notes).toContain("## Features");
    expect(notes).toContain("- #1 Add login");
    expect(notes).toContain("## Bugs");
    expect(notes).toContain("- #2 Fix crash");
  });

  it("handles empty releases", () => {
    const notes = generateReleaseNotes("v1.0.0", []);
    expect(notes).toContain("No issues resolved in this release.");
  });
});
