/**
 * Who gets a security-check job (#security-checks). Plain logic with no
 * database, so it is easy to test.
 *
 * Only Ziki-managed always-on agents are candidates. Agents already active in
 * the client's workspace (its default agents) go first; then the agent with
 * the fewest open jobs; then the earliest in the list, so the choice is stable.
 */

export type CandidateAgent = {
  id: string;
  /** Workspaces the agent is active in. */
  organisationIds: string[];
  /** Jobs it holds now. */
  openJobs: number;
};

export function pickAgentFor(organisationId: string, agents: CandidateAgent[], maxOpenJobs: number): CandidateAgent | null {
  let best: CandidateAgent | null = null;
  let bestRank: [number, number] | null = null;
  for (const agent of agents) {
    if (agent.openJobs >= maxOpenJobs) continue;
    const rank: [number, number] = [agent.organisationIds.includes(organisationId) ? 0 : 1, agent.openJobs];
    if (!bestRank || rank[0] < bestRank[0] || (rank[0] === bestRank[0] && rank[1] < bestRank[1])) {
      best = agent;
      bestRank = rank;
    }
  }
  return best;
}
