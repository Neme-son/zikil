export type PublicProjectRef = { orgSlug: string; projectSlug: string };

export function publicProjectPath(ref: PublicProjectRef): string {
  return `/p/${encodeURIComponent(ref.orgSlug)}/${encodeURIComponent(ref.projectSlug)}`;
}

export function publicReportPath(ref: PublicProjectRef): string {
  return `${publicProjectPath(ref)}/report`;
}

export function publicTrackingPath(ref: PublicProjectRef, token: string): string {
  return `${publicProjectPath(ref)}/track/${encodeURIComponent(token)}`;
}

export function publicWorkItemPath(
  ref: PublicProjectRef,
  kind: "issue" | "idea",
  number: number,
): string {
  return `${publicProjectPath(ref)}/${kind === "issue" ? "issues" : "ideas"}/${number}`;
}
