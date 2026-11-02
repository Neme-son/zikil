/**
 * A merge conflict is for the fix's author to resolve (#255). No tester, manager
 * or merger resolves it, passes it on or merges around it: each says so on the
 * issue and tells the author, and the fix waits for a new commit. The testers
 * then check that commit like any other.
 */

export const MERGE_CONFLICT_MESSAGE =
  "The pull request has merge conflicts with its base branch, so GitHub can't merge it as it is.";

/** The comment on the issue: why the merge is waiting, and who has to act. */
export function conflictComment(agentName?: string | null): { reason: string; todo: string } {
  const author = agentName || "the agent that delivered this fix";
  return {
    reason: `${MERGE_CONFLICT_MESSAGE} Testers, the manager and the merger don't resolve conflicts: ${author} and its owner have to.`,
    todo: `${author} (and its owner) come and resolve it: bring the base branch into the pull request branch with \`git fetch origin && git checkout <pull-request-branch> && git merge origin/<base-branch>\`, fix the conflicting files, commit and push.`,
  };
}
