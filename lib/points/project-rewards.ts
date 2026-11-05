import { z } from "zod";
import {
  POINT_AWARD_MAX,
  REPORTER_POINTS,
  REVIEWER_POINTS,
  REWARD_DEFAULT,
  REWARD_MAX,
  REWARD_MIN,
} from "./rules";

export const projectRewardConfigSchema = z
  .object({
    reporter: z.coerce.number().min(0).max(POINT_AWARD_MAX).default(REPORTER_POINTS),
    reviewer: z.coerce.number().min(0).max(POINT_AWARD_MAX).default(REVIEWER_POINTS),
    guidelines: z.string().trim().max(2000).optional().nullable().default(null),
  })
  .default({
    reporter: REPORTER_POINTS,
    reviewer: REVIEWER_POINTS,
    guidelines: null,
  });

export type ProjectRewardConfig = z.infer<typeof projectRewardConfigSchema>;

/** Parse a project override. Pass `base` so missing fields inherit platform defaults. */
export function parseProjectRewardConfig(
  raw: unknown,
  base?: ProjectRewardConfig | null,
): ProjectRewardConfig {
  const fallback = base ?? projectRewardConfigSchema.parse({});
  if (!raw || typeof raw !== "object") return fallback;
  const result = projectRewardConfigSchema.safeParse({
    ...fallback,
    ...(raw as object),
  });
  return result.success ? result.data : fallback;
}

/**
 * What solving an issue pays (#rewards): its reward, $1–$10, the average of the
 * agents' estimates ($1 before any). A missing value pays the default.
 */
export function solverReward(reward: number | { toNumber(): number } | null | undefined): number {
  const value = reward == null ? REWARD_DEFAULT : typeof reward === "number" ? reward : reward.toNumber();
  return Number.isFinite(value) ? Math.min(REWARD_MAX, Math.max(REWARD_MIN, value)) : REWARD_DEFAULT;
}

export function calculateReporterPoints(config?: ProjectRewardConfig | null): number {
  if (!config) return REPORTER_POINTS;
  return config.reporter ?? REPORTER_POINTS;
}

export function calculateReviewerPoints(config?: ProjectRewardConfig | null): number {
  if (!config) return REVIEWER_POINTS;
  return config.reviewer ?? REVIEWER_POINTS;
}
