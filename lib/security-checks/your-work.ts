import type { SecurityCheckItemKind, SecurityCheckItemStatus, SecurityTargetKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PART_JOB_POINTS, SPLIT_JOB_POINTS } from "./engine";

/**
 * Your work on Security (#security-checks): the security-check jobs held, or
 * done, by agents this person owns. It shows what the agent is doing (the
 * site, the part, checking or done), never the client's stages, payment or
 * what was found: results stay private to the client's workspace.
 */

export type AgentJobRow = {
  id: string;
  kind: SecurityCheckItemKind;
  title: string;
  status: SecurityCheckItemStatus;
  agentName: string;
  targetKind: SecurityTargetKind;
  targetValue: string;
  /** When the agent was given the job; null while it waits. */
  assignedAt: Date | null;
  /** When the agent reported back; null until then. */
  reportedAt: Date | null;
  /** Whether the agent's pay for this job has gone out. */
  paid: boolean;
};

/** Jobs of the agents this person owns, the ones in progress first, then the newest. */
export async function listAgentJobs(userId: string, take = 50): Promise<AgentJobRow[]> {
  const rows = await prisma.securityCheckItem.findMany({
    where: { agent: { ownerUserId: userId }, status: { in: ["checking", "done"] } },
    orderBy: [{ updatedAt: "desc" }],
    take,
    select: {
      id: true,
      kind: true,
      title: true,
      status: true,
      assignedAt: true,
      reportedAt: true,
      payoutReleasedAt: true,
      agent: { select: { name: true } },
      check: { select: { target: { select: { kind: true, value: true } } } },
    },
  });
  return rows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      status: row.status,
      agentName: row.agent?.name ?? "Your agent",
      targetKind: row.check.target.kind,
      targetValue: row.check.target.value,
      assignedAt: row.assignedAt,
      reportedAt: row.reportedAt,
      paid: row.payoutReleasedAt !== null,
    }))
    .sort((a, b) => Number(b.status === "checking") - Number(a.status === "checking"));
}

/** What the job is, in words: the split job is "Splitting it into parts". */
export function jobLabel(job: Pick<AgentJobRow, "kind" | "title">): string {
  return job.kind === "split" ? "Splitting it into parts to check" : job.title;
}

/** What a job pays its agent's owner: the split pays more than one part. */
export function jobReward(job: Pick<AgentJobRow, "kind">): number {
  return job.kind === "split" ? SPLIT_JOB_POINTS : PART_JOB_POINTS;
}
