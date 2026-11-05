-- #z-currency, #rewards, #live-payout: one currency, the Ƶ. Every stored amount was in points
-- (100 points were shown as $1), so each is divided by 100 into Ƶ. Issues get a reward
-- (planning poker estimates), deployment reports are kept per person, and a resolution's
-- payout is held until three people report the work deployed.

-- AlterTable
ALTER TABLE "Bug" ADD COLUMN     "heldPayout" JSONB,
ADD COLUMN     "payoutReleasedAt" TIMESTAMP(3),
ADD COLUMN     "reward" DECIMAL(6,2) NOT NULL DEFAULT 1,
ADD COLUMN     "rewardEstimateCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rewardFixedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Job" ALTER COLUMN "pointsPerAccepted" SET DATA TYPE DECIMAL(16,4);

-- CreateTable
CREATE TABLE "RewardEstimate" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "onBehalfOfUserId" TEXT NOT NULL,
    "agentId" TEXT,
    "value" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentReport" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "onBehalfOfUserId" TEXT NOT NULL,
    "agentId" TEXT,
    "environment" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardEstimate_bugId_onBehalfOfUserId_key" ON "RewardEstimate"("bugId", "onBehalfOfUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentReport_bugId_onBehalfOfUserId_key" ON "DeploymentReport"("bugId", "onBehalfOfUserId");

-- AddForeignKey
ALTER TABLE "RewardEstimate" ADD CONSTRAINT "RewardEstimate_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentReport" ADD CONSTRAINT "DeploymentReport_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Amounts: points → Ƶ.
UPDATE "PointEntry" SET "points" = "points" / 100;
UPDATE "ConfirmationPenalty" SET "points" = "points" / 100;
UPDATE "Job" SET "pointsPerAccepted" = "pointsPerAccepted" / 100;

-- Saved reward settings: the same amounts in Ƶ. The solver amount is gone: an issue's reward pays the solver.
UPDATE "PlatformSettings"
SET "rewardConfig" = (
  SELECT jsonb_object_agg(
    entry.key,
    CASE
      WHEN entry.key IN ('reporter', 'reviewer', 'confirmationReviewer', 'triagerClear', 'duplicateMarker', 'dispatcher', 'target')
        AND jsonb_typeof(entry.value) = 'number'
      THEN to_jsonb((entry.value::text)::numeric / 100)
      ELSE entry.value
    END
  )
  FROM jsonb_each("rewardConfig"::jsonb) AS entry
  WHERE entry.key <> 'solver'
)
WHERE "rewardConfig" IS NOT NULL AND jsonb_typeof("rewardConfig"::jsonb) = 'object';

UPDATE "Project"
SET "rewardConfig" = (
  SELECT jsonb_object_agg(
    entry.key,
    CASE
      WHEN entry.key IN ('reporter', 'reviewer') AND jsonb_typeof(entry.value) = 'number'
      THEN to_jsonb((entry.value::text)::numeric / 100)
      ELSE entry.value
    END
  )
  FROM jsonb_each("rewardConfig"::jsonb) AS entry
  WHERE entry.key <> 'solver'
)
WHERE "rewardConfig" IS NOT NULL AND jsonb_typeof("rewardConfig"::jsonb) = 'object';
