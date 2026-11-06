import type { Prisma, PrismaClient } from "@prisma/client";
import { issueHref } from "@/lib/issue-ref";

/**
 * What your agents are doing (#points-wallet): beside your standing on
 * Ranking, the issues your agents hold or have bid on, each with its reward
 * and where the work is. Agents act through the API, so this is a view, not
 * a list of buttons: the owner sees what is coming and who is on it.
 */

export type AgentWorkStatus = "offered" | "working" | "in_review" | "bid";

export type AgentWorkRow = {
  key: string;
  issueNumber: number;
  title: string;
  href: string;
  reward: number;
  agentName: string;
  status: AgentWorkStatus;
};

export const AGENT_WORK_LABEL: Record<AgentWorkStatus, string> = {
  working: "is working on it",
  in_review: "delivered it, waiting for review",
  offered: "was offered it",
  bid: "has bid",
};

const ORDER: Record<AgentWorkStatus, number> = { working: 0, in_review: 1, offered: 2, bid: 3 };

type IssueRef = { id: string; number: number; title: string; status: string; reward: unknown; href: string };

export type AgentWorkInput = {
  claims: { id: string; status: "offered" | "active" | "released"; agentName: string; issue: IssueRef }[];
  bids: { id: string; agentName: string; issue: IssueRef }[];
};

/**
 * One row per issue, the strongest step first (a claim beats a bid on the same
 * issue), ordered working, in review, offered, bid, then by reward.
 */
export function agentsWorkRows(input: AgentWorkInput, limit = 5): AgentWorkRow[] {
  const byIssue = new Map<string, AgentWorkRow>();
  const add = (row: AgentWorkRow, issueId: string) => {
    const seen = byIssue.get(issueId);
    if (!seen || ORDER[row.status] < ORDER[seen.status]) byIssue.set(issueId, row);
  };
  for (const claim of input.claims) {
    if (claim.status === "released") continue;
    const delivered = claim.issue.status === "done" || claim.issue.status === "merge";
    const status: AgentWorkStatus = claim.status === "offered" ? "offered" : delivered ? "in_review" : "working";
    add({ key: `claim-${claim.id}`, issueNumber: claim.issue.number, title: claim.issue.title, href: claim.issue.href, reward: Number(claim.issue.reward) || 0, agentName: claim.agentName, status }, claim.issue.id);
  }
  for (const bid of input.bids) {
    add({ key: `bid-${bid.id}`, issueNumber: bid.issue.number, title: bid.issue.title, href: bid.issue.href, reward: Number(bid.issue.reward) || 0, agentName: bid.agentName, status: "bid" }, bid.issue.id);
  }
  return [...byIssue.values()]
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.reward - a.reward || a.issueNumber - b.issueNumber)
    .slice(0, limit);
}

type Db = Pick<PrismaClient, "issueClaim" | "issueBid"> | Prisma.TransactionClient;

const issueSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  reward: true,
  project: { select: { slug: true, organisation: { select: { slug: true } } } },
} satisfies Prisma.BugSelect;

/**
 * The rows for `userId`'s agents in `tenantId`: their current claims and open
 * bids. Every eligible record is loaded and ranked before the limit is applied,
 * so an older high-reward item is never dropped before ranking. A person holds
 * few claims and bids at once, so this stays small.
 */
export async function loadAgentsWork(db: Db, tenantId: string, userId: string, limit = 5): Promise<AgentWorkRow[]> {
  const openIssue: Prisma.BugWhereInput = { tenantId, isDeleted: false, status: { notIn: ["closed", "resolved"] } };
  const [claims, bids] = await Promise.all([
    db.issueClaim.findMany({
      where: { beneficiaryUserId: userId, releasedAt: null, status: { in: ["offered", "active"] }, bug: openIssue },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, agent: { select: { name: true } }, bug: { select: issueSelect } },
    }),
    db.issueBid.findMany({
      where: { beneficiaryUserId: userId, withdrawnAt: null, awardedAt: null, bug: openIssue },
      orderBy: { updatedAt: "desc" },
      select: { id: true, agent: { select: { name: true } }, bug: { select: issueSelect } },
    }),
  ]);
  const issue = (bug: (typeof claims)[number]["bug"]): IssueRef => ({ ...bug, href: issueHref(bug) });
  return agentsWorkRows(
    {
      claims: claims.map((claim) => ({ id: claim.id, status: claim.status, agentName: claim.agent.name, issue: issue(claim.bug) })),
      bids: bids.map((bid) => ({ id: bid.id, agentName: bid.agent.name, issue: issue(bid.bug) })),
    },
    limit,
  );
}
