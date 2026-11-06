import { z } from "zod";

export const JUDGING_CHECKS = [
  "reproducedOnMain",
  "fixWorksOnDeliveredBranch",
  "regressionsChecked",
  "proofMatchesObserved",
] as const;

export type JudgingCheck = (typeof JUDGING_CHECKS)[number];
export type JudgingChecks = Record<JudgingCheck, boolean>;
export type JudgingOutcome = "approve" | "send_back";
export type EvidenceType = "screenshot" | "test_output" | "log" | "link";

export type JudgingEvidence = {
  type: EvidenceType;
  url: string;
  caption?: string;
};

export type JudgingSubmission = {
  outcome: JudgingOutcome;
  checks: JudgingChecks;
  evidence: JudgingEvidence[];
  notes: string;
};

const checkLabels: Record<JudgingCheck, string> = {
  reproducedOnMain: "Reproduced on main",
  fixWorksOnDeliveredBranch: "Fix works on the delivered branch",
  regressionsChecked: "Nearby behaviour checked for regressions",
  proofMatchesObserved: "Delivered proof matches what you saw",
};

const checksSchema = z.object({
  reproducedOnMain: z.boolean(),
  fixWorksOnDeliveredBranch: z.boolean(),
  regressionsChecked: z.boolean(),
  proofMatchesObserved: z.boolean(),
}).strict();

const evidenceSchema = z.object({
  type: z.enum(["screenshot", "test_output", "log", "link"]),
  url: z.string().trim().min(1, "Add a URL.").max(2048, "Use a URL under 2,048 characters.").refine(isHttpUrl, "Use a valid http or https URL."),
  caption: z.string().trim().max(300, "Keep captions to 300 characters or fewer.").optional(),
}).strict();

export const judgingSubmissionSchema = z.object({
  outcome: z.enum(["approve", "send_back"]),
  checks: checksSchema,
  evidence: z.array(evidenceSchema).max(8, "Keep the evidence list to 8 links or fewer.").default([]),
  notes: z.string().max(2000, "Keep notes to 2,000 characters or fewer.").default(""),
}).strict();

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type ValidationResult =
  | { success: true; data: JudgingSubmission }
  | { success: false; errors: string[] };

function pathLabel(path: PropertyKey[]): string {
  const first = path[0];
  if (typeof first === "string" && first.length > 0) return `${first}: `;
  return "";
}

export function validateJudgingSubmission(body: unknown): ValidationResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, errors: ["Send a JSON object with an outcome and all four checks."] };
  }

  const parsed = judgingSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${pathLabel(issue.path)}${issue.message}`),
    };
  }

  const { outcome, checks, evidence, notes } = parsed.data;
  const errors: string[] = [];

  if (outcome === "approve") {
    for (const key of JUDGING_CHECKS) {
      if (!checks[key]) errors.push(`Tick “${checkLabels[key]}” before approving.`);
    }
    if (evidence.length === 0) errors.push("Add at least one evidence link before approving.");
  } else {
    if (notes.trim().length < 20) errors.push("Add at least 20 characters of notes explaining what needs to change.");
    if (JUDGING_CHECKS.every((key) => checks[key]) && evidence.length === 0) {
      errors.push("Untick a check or add evidence to explain why this delivery needs changes.");
    }
  }

  return errors.length > 0
    ? { success: false, errors }
    : { success: true, data: parsed.data };
}

export type JudgingEligibilityInput = {
  role: string;
  agentId: string;
  ownerId: string;
  claimHolderAgentId: string | null;
  claimHolderOwnerId: string | null;
  judgedAgentIds: readonly string[];
  judgedOwnerIds: readonly string[];
  closed: boolean;
};

export type IneligibilityReason = "not_tester" | "judging_closed" | "own_work" | "same_owner" | "already_judged";

export function judgingIneligibility(input: JudgingEligibilityInput): IneligibilityReason | null {
  if (input.role !== "tester") return "not_tester";
  if (input.closed) return "judging_closed";
  if (input.agentId === input.claimHolderAgentId) return "own_work";
  if (input.ownerId === input.claimHolderOwnerId) return "same_owner";
  if (input.judgedAgentIds.includes(input.agentId) || input.judgedOwnerIds.includes(input.ownerId)) {
    return "already_judged";
  }
  return null;
}

export type QuorumVote = { ownerId: string; outcome: JudgingOutcome };
export type QuorumThresholds = { approve: number; send_back: number };
export type QuorumResult = {
  outcome: JudgingOutcome;
  approvals: number;
  sendBacks: number;
};

/** Replays votes in arrival order; the first side to reach its threshold wins. */
export function resolveJudgingQuorum(
  votes: readonly QuorumVote[],
  thresholds: QuorumThresholds,
): QuorumResult | null {
  const owners = new Set<string>();
  let approvals = 0;
  let sendBacks = 0;

  for (const vote of votes) {
    if (owners.has(vote.ownerId)) continue;
    owners.add(vote.ownerId);
    if (vote.outcome === "approve") approvals += 1;
    else sendBacks += 1;

    if (approvals >= thresholds.approve) return { outcome: "approve", approvals, sendBacks };
    if (sendBacks >= thresholds.send_back) return { outcome: "send_back", approvals, sendBacks };
  }
  return null;
}

export function countJudgingVotes(votes: readonly QuorumVote[]): {
  submitted: number;
  approvals: number;
  sendBacks: number;
} {
  const owners = new Set<string>();
  let approvals = 0;
  let sendBacks = 0;
  for (const vote of votes) {
    if (owners.has(vote.ownerId)) continue;
    owners.add(vote.ownerId);
    if (vote.outcome === "approve") approvals += 1;
    else sendBacks += 1;
  }
  return { submitted: owners.size, approvals, sendBacks };
}

export function judgingStatus(outcome: JudgingOutcome): {
  status: "done" | "open";
  substatus: "requires_review" | "open";
  deliveryState: "passed" | "rejected";
} {
  return outcome === "approve"
    ? { status: "done", substatus: "requires_review", deliveryState: "passed" }
    : { status: "open", substatus: "open", deliveryState: "rejected" };
}

export type FeedbackVote = {
  outcome: JudgingOutcome;
  agentName: string;
  ownerName: string;
  checks: JudgingChecks;
  notes: string;
};

export function consolidateJudgingFeedback(votes: readonly FeedbackVote[]) {
  const checkFailures: Record<JudgingCheck, number> = {
    reproducedOnMain: 0,
    fixWorksOnDeliveredBranch: 0,
    regressionsChecked: 0,
    proofMatchesObserved: 0,
  };
  const notes: Array<{ agentName: string; ownerName: string; notes: string }> = [];

  for (const vote of votes) {
    if (vote.outcome !== "send_back") continue;
    for (const key of JUDGING_CHECKS) {
      if (!vote.checks[key]) checkFailures[key] += 1;
    }
    notes.push({ agentName: vote.agentName, ownerName: vote.ownerName, notes: vote.notes });
  }

  return { checkFailures, notes };
}
