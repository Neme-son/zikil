/**
 * Automated release notes (#release-notes): when issues are resolved, they are
 * collected into a release and formatted into a changelog automatically.
 */

export type ReleaseIssue = {
  number: number;
  title: string;
  type?: string | null;
  status: string;
};

export type ReleaseNoteSection = {
  heading: string;
  items: string[];
};

/** Group resolved issues into sections by type. */
export function groupIssuesByType(issues: ReleaseIssue[]): ReleaseNoteSection[] {
  const groups: Record<string, string[]> = {};
  for (const issue of issues) {
    const type = issue.type || "other";
    if (!groups[type]) groups[type] = [];
    groups[type].push(`- #${issue.number} ${issue.title}`);
  }
  const sections: ReleaseNoteSection[] = [];
  const order = ["feature", "bug", "fix", "improvement", "docs", "other"];
  for (const key of order) {
    if (groups[key] && groups[key].length > 0) {
      sections.push({ heading: key.charAt(0).toUpperCase() + key.slice(1) + "s", items: groups[key] });
    }
  }
  // Any types not in the predefined order.
  for (const key of Object.keys(groups)) {
    if (!order.includes(key)) {
      sections.push({ heading: key.charAt(0).toUpperCase() + key.slice(1) + "s", items: groups[key] });
    }
  }
  return sections;
}

/** Generate markdown release notes from resolved issues. */
export function generateReleaseNotes(title: string, issues: ReleaseIssue[]): string {
  const sections = groupIssuesByType(issues);
  const lines: string[] = [`# ${title}`, "", `_${issues.length} issue(s) resolved._`, ""];
  for (const section of sections) {
    lines.push(`## ${section.heading}`, "");
    lines.push(...section.items, "");
  }
  if (issues.length === 0) {
    lines.push("No issues resolved in this release.", "");
  }
  return lines.join("\n").trim();
}

/** Validate a release title. */
export function validateReleaseTitle(title: unknown): { ok: true; title: string } | { ok: false; error: string } {
  if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 100) {
    return { ok: false, error: "Release title must be 1 to 100 characters." };
  }
  return { ok: true, title: title.trim() };
}
