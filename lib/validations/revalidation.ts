import { z } from "zod";
import { entryDescription, entrySummary } from "@/lib/agent-api/entry-fields";
import { REVALIDATION_VERDICTS } from "@/lib/revalidation";

/**
 * The bodies of the revalidation routes (#revalidation).
 *
 * - `POST /api/v1/issues/{id}/repro` records the issue's repro profile.
 * - `POST /api/v1/projects/{id}/code-changes` reports the paths a change
 *   touched, so Ziki can ask for re-checks on the issues in that area.
 * - `POST /api/v1/issues/{id}/revalidation` gives a re-check's verdict.
 */

const sha = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{7,64}$/i, "Send a hexadecimal commit SHA.");

const projectId = z.string().trim().min(1).max(191).optional();

/** A file, directory or endpoint an issue lives in. */
const area = z.string().trim().min(1).max(500);

export const reproSchema = z
  .object({
    /** Files and directories the bug lives in, as the repository has them. */
    affectedPaths: z.array(area).max(50).default([]),
    /** Routes it shows on, such as `POST /api/v1/issues/:id/importance`. */
    affectedEndpoints: z.array(area).max(50).default([]),
    /** How to see it, from a clean checkout. */
    steps: z.string().trim().min(10, "Say how to reproduce it, step by step.").max(4000),
    expected: z.string().trim().min(1, "Say what should happen.").max(2000),
    actual: z.string().trim().min(1, "Say what happens instead.").max(2000),
    /** The commit it was seen on. */
    commitSha: sha.optional(),
    projectId,
  })
  .strict()
  .refine((body) => body.affectedPaths.length > 0 || body.affectedEndpoints.length > 0, {
    message: "Name at least one affected path or endpoint, so a later change can be matched to this issue.",
    path: ["affectedPaths"],
  });

export type ReproInput = z.infer<typeof reproSchema>;

export const codeChangeSchema = z
  .object({
    /** The commit the change is in. */
    commitSha: sha,
    /** The pull request it came from, when there is one. */
    pullRequestUrl: z.string().trim().min(1).max(2048).optional(),
    /** Every path the change touched, as the commit holds them. */
    changedPaths: z
      .array(z.string().trim().min(1).max(1000))
      .min(1, "Send the paths the change touched.")
      .max(500),
    /** What you saw, in a sentence or two. */
    note: z.string().trim().min(1).max(1000).optional(),
    projectId,
  })
  .strict();

export type CodeChangeInput = z.infer<typeof codeChangeSchema>;

export const revalidationSchema = z
  .object({
    verdict: z.enum(REVALIDATION_VERDICTS),
    summary: entrySummary,
    description: entryDescription,
    /** The commit the re-check is about; the change's row is chosen by it. */
    commitSha: sha.optional(),
    projectId,
  })
  .strict();

export type RevalidationInput = z.infer<typeof revalidationSchema>;
