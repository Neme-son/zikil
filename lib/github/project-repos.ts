import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientForInstallation, parseGitHubRepoUrl } from "./merge-pr";

/** All repositories for a project, including the main repoUrl first. */
export async function getProjectRepositories(
  projectId: string,
  mainRepo: { repoUrl: string | null; githubInstallationId: string | null } | null,
  db: PrismaClient = prisma,
): Promise<Array<{ repoUrl: string; githubInstallationId: string | null }>> {
  const repos = await db.projectRepository.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { repoUrl: true, githubInstallationId: true },
  });

  const allRepos: Array<{ repoUrl: string; githubInstallationId: string | null }> = [];
  if (mainRepo?.repoUrl) {
    allRepos.push({ repoUrl: mainRepo.repoUrl, githubInstallationId: mainRepo.githubInstallationId });
  }
  for (const repo of repos) {
    allRepos.push({ repoUrl: repo.repoUrl, githubInstallationId: repo.githubInstallationId });
  }
  return allRepos;
}

/** Find the repository a pull request belongs to, among all project repos.
 * Returns the repo URL and installation ID to use for checks and merging.
 */
export function findMatchingRepository(
  ref: { owner: string; repo: string },
  repos: Array<{ repoUrl: string; githubInstallationId: string | null }>,
): { repoUrl: string; githubInstallationId: string | null } | null {
  for (const repo of repos) {
    const parsed = parseGitHubRepoUrl(repo.repoUrl);
    if (parsed && parsed.owner.toLowerCase() === ref.owner.toLowerCase() && parsed.repo.toLowerCase() === ref.repo.toLowerCase()) {
      return repo;
    }
  }
  return null;
}

/** Get the GitHub client for a specific repository's installation,
 * falling back to the project's installation. */
export function clientForRepository(
  repo: { repoUrl: string; githubInstallationId: string | null } | null,
  projectInstallationId: string | null | undefined,
  env?: NodeJS.ProcessEnv,
): ReturnType<typeof clientForInstallation> | null {
  if (repo?.githubInstallationId) {
    return clientForInstallation(repo.githubInstallationId, env);
  }
  return clientForInstallation(projectInstallationId, env);
}
