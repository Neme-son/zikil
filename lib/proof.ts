import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Deeper testing (#deeper-testing): what a judgement must prove.
 *
 * - An organisation's owners set checks for every issue and per issue type;
 *   a project's owners and admins add checks per area (`ProofRule`). With no
 *   rules at all the organisation works exactly as before: every judgement
 *   counts.
 * - A good-to-merge counts only with proof (an attachment) for every required
 *   check, on the delivered commit. A not-good-to-merge counts toward sending
 *   the work back only with proof of what fails (lib/agent-api/tested-status.ts).
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** What a file must be to prove something: a picture of what you saw, or a test's or a log's output. */
export type ProofKind = "screen" | "test" | "log";

/** Checks every organisation can use. Builds and tests aren't here: the pull request report already gates a yes on them. */
export const BUILT_IN_CHECKS: Record<string, { name: string; proof: string; kind?: ProofKind }> = {
  repro: { name: "Saw the bug", proof: "A screenshot or recording of the bug on the code before the fix." },
  fixed: { name: "Works on the PR", proof: "A screenshot or recording of it working on the delivered commit." },
  regression: { name: "Regression test", proof: "Test-run output: the new test fails without the fix and passes with it.", kind: "test" },
  phone: { name: "On a phone", proof: "A screenshot or recording at phone width (375px)." },
  theme: { name: "Light & dark", proof: "Screenshots in both themes." },
  staging: { name: "On staging", proof: "A recording of it working on staging." },
};

const proofEntry = z
  .object({
    result: z.enum(["pass", "fail", "na"]),
    /** Upload the proof with `POST /api/v1/attachments` first. */
    attachmentId: z.string().trim().min(1).max(191).optional(),
    /** What the file shows, in one sentence, so a reader can check it (with `pass` or `fail`). */
    shows: z.string().trim().min(10).max(300).optional(),
    /** For a test: its file in the pull request, e.g. "tests/composer.test.ts". */
    test: z.string().trim().min(3).max(300).optional(),
    /** Why it doesn't apply (with `na`). */
    reason: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
  .refine((entry) => (entry.result === "na" ? Boolean(entry.reason) : Boolean(entry.attachmentId && entry.shows)), {
    message: "A pass or fail needs attachmentId (upload the proof first) and shows (what the file shows); not applicable needs a reason.",
  });

/** What a judgement proved, per check. */
export const proofSchema = z
  .object({
    checks: z.record(z.string().max(191), proofEntry).optional(),
  })
  .strict()
  // A handful of checks apply to an issue: anything far past that isn't proof.
  .refine((p) => Object.keys(p.checks ?? {}).length <= 30, { message: "At most 30 checks in one judgement." });

export type VerdictProof = z.infer<typeof proofSchema>;
type ProofEntry = z.infer<typeof proofEntry>;

export function storedProof(value: unknown): VerdictProof {
  const parsed = proofSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

/** Every attachment a judgement names, to check they belong to the issue. */
export function proofAttachmentIds(proof: VerdictProof): string[] {
  return Object.values(proof.checks ?? {}).flatMap((e) => (e.attachmentId ? [e.attachmentId] : []));
}

/** A screenshot this small is blank: real ones are tens of kilobytes. */
const MIN_IMAGE_BYTES = 2048;

/**
 * Why a judgement's proof can't count, or null. Each file must suit what it
 * proves: a picture (image or PDF) for what you can see, a text file of the
 * run or the logs for a test or a log; no blank image. A test names its file,
 * which must be one of the changed files the judgement lists.
 */
export function proofProblem(
  proof: VerdictProof,
  lookup: { file: (id: string) => { contentType: string; size: number } | undefined; changed: string[] },
): string | null {
  // A check the owners wrote may ask for any kind of file.
  const entries = Object.entries(proof.checks ?? {}).map(([id, e]): [string, ProofEntry, ProofKind | null] => [`checks.${id}`, e, BUILT_IN_CHECKS[id] ? (BUILT_IN_CHECKS[id].kind ?? "screen") : null]);
  for (const [where, entry, kind] of entries) {
    if (entry.result === "na" || !entry.attachmentId) continue;
    const file = lookup.file(entry.attachmentId);
    if (!file) return `proof.${where}: no such file on this issue.`;
    const picture = file.contentType.startsWith("image/") || file.contentType === "application/pdf";
    if (file.contentType.startsWith("image/") && file.size < MIN_IMAGE_BYTES) return `proof.${where}: the image is too small to show anything; attach a real screenshot.`;
    if (kind === "screen" && !picture) return `proof.${where}: attach a screenshot (an image or PDF) of what you saw.`;
    if ((kind === "test" || kind === "log") && picture) return `proof.${where}: a picture can't prove a ${kind}; attach the ${kind === "test" ? "test run's output" : "logs"} as a text file.`;
    if (kind === "test" && entry.result === "pass" && (!entry.test || !lookup.changed.includes(entry.test))) {
      return `proof.${where}: name the test in test, as one of the changed files you list in files.`;
    }
  }
  return null;
}

export type ProofRules = {
  rules: { id: string; projectId: string | null; issueTypeId: string | null; projectAreaId: string | null; checks: string[] }[];
  custom: { id: string; name: string; instructions: string; required: boolean }[];
};

export async function loadProofRules(db: Db, organisationId: string): Promise<ProofRules> {
  const [rules, custom] = await Promise.all([
    db.proofRule.findMany({ where: { organisationId }, orderBy: { createdAt: "asc" }, select: { id: true, projectId: true, issueTypeId: true, projectAreaId: true, checks: true } }),
    db.proofCheck.findMany({ where: { organisationId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, instructions: true, required: true } }),
  ]);
  return { rules, custom };
}

/** A check's name and what to attach, built-in or written by the owners; null once deleted. */
export function checkInfo(id: string, rules: ProofRules): { name: string; proof: string; required: boolean } | null {
  const builtIn = BUILT_IN_CHECKS[id];
  if (builtIn) return { ...builtIn, required: true };
  const custom = rules.custom.find((c) => c.id === id);
  return custom ? { name: custom.name, proof: custom.instructions, required: custom.required } : null;
}

/** Every check an organisation can put in a rule: the built-in ones, then its owners'. */
export function checkOptions(rules: ProofRules): { id: string; name: string; proof: string; required: boolean; custom: boolean }[] {
  return [
    ...Object.entries(BUILT_IN_CHECKS).map(([id, c]) => ({ id, ...c, required: true, custom: false })),
    ...rules.custom.map((c) => ({ id: c.id, name: c.name, proof: c.instructions, required: c.required, custom: true })),
  ];
}

export type IssueChecks = { on: boolean; required: string[]; guidance: string[] };

/** No checks: every judgement counts, as before (marketing work, and organisations with no rules). */
export const NO_CHECKS: IssueChecks = { on: false, required: [], guidance: [] };

/** The checks an issue needs: the organisation's for every issue and for its type, and its project's for its area. */
export function checksFor(rules: ProofRules, bug: { projectId: string; typeId: string | null; areaId: string | null }): IssueChecks {
  const ids = new Set<string>();
  for (const rule of rules.rules) {
    const applies = rule.projectId
      ? rule.projectId === bug.projectId && rule.projectAreaId !== null && rule.projectAreaId === bug.areaId
      : rule.issueTypeId === null || rule.issueTypeId === bug.typeId;
    if (applies) rule.checks.forEach((id) => ids.add(id));
  }
  const known = [...ids].flatMap((id) => {
    const info = checkInfo(id, rules);
    return info ? [{ id, required: info.required }] : [];
  });
  return { on: rules.rules.length > 0, required: known.filter((c) => c.required).map((c) => c.id), guidance: known.filter((c) => !c.required).map((c) => c.id) };
}

export type JudgementProofState = "counts" | "no_proof" | "earlier_code" | "contradicts" | "proved_fail" | "no_fail_proof";

const isProvenFail = (entry: ProofEntry) => entry.result === "fail" && Boolean(entry.attachmentId);

/**
 * Whether a judgement counts: a good-to-merge with proof for every required
 * check on the delivered commit, or a not-good-to-merge with proof of a fail.
 */
export function judgementProof(
  verdict: { goodToMerge: boolean; headSha: string | null; proof: unknown },
  required: readonly string[],
  deliveredSha: string | null,
): { state: JudgementProofState; missing: string[] } {
  const proof = storedProof(verdict.proof);
  if (deliveredSha && verdict.headSha && verdict.headSha !== deliveredSha) return { state: "earlier_code", missing: [] };
  const fails = Object.values(proof.checks ?? {}).some(isProvenFail);
  if (!verdict.goodToMerge) return { state: fails ? "proved_fail" : "no_fail_proof", missing: [] };
  if (fails) return { state: "contradicts", missing: [] };
  const missing = required.filter((id) => {
    const entry = proof.checks?.[id];
    return !entry || entry.result === "fail";
  });
  return { state: missing.length ? "no_proof" : "counts", missing };
}

/** Whether a judgement counts toward the gate or a send-back. Organisations without checks count every judgement, as before. */
export function countsWithProof(
  verdict: { goodToMerge: boolean; headSha: string | null; proof: unknown },
  checks: IssueChecks,
  deliveredSha: string | null,
): boolean {
  if (!checks.on) return true;
  const { state } = judgementProof(verdict, checks.required, deliveredSha);
  return verdict.goodToMerge ? state === "counts" : state === "proved_fail";
}

/** Everything the checks need about an issue. */
export const cardBugSelect = {
  id: true,
  organisationId: true,
  projectId: true,
  typeId: true,
  areaId: true,
  priority: true,
  pullRequestUrl: true,
  pullRequestHeadSha: true,
} satisfies Prisma.BugSelect;
