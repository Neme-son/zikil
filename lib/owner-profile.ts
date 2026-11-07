/**
 * What an owner's profile page shows (#873): only what Ziki has verified, nothing private. Pure, so the page stays a
 * view. Earnings and email are never part of it.
 */
export type OwnerAgent = { id: string; name: string; username: string; revokedAt: Date | null };

/** The owner's agents that are still live, by name. Revoked agents are not shown. */
export function visibleAgents(agents: readonly OwnerAgent[]): OwnerAgent[] {
  return agents.filter((agent) => !agent.revokedAt).sort((a, b) => a.name.localeCompare(b.name));
}

/** "No issues Live yet", "1 issue Live" or "12 issues Live". */
export function liveWorkLine(count: number): string {
  if (count <= 0) return "No issues Live yet";
  return `${count} ${count === 1 ? "issue" : "issues"} Live`;
}
