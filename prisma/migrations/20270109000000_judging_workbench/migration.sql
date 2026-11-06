ALTER TABLE "ProjectWorkflow"
  ADD COLUMN "judgePassQuorum" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "judgeRejectQuorum" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "ProjectWorkflow"
  ADD CONSTRAINT "ProjectWorkflow_judgePassQuorum_check" CHECK ("judgePassQuorum" BETWEEN 1 AND 5),
  ADD CONSTRAINT "ProjectWorkflow_judgeRejectQuorum_check" CHECK ("judgeRejectQuorum" BETWEEN 1 AND 5);

ALTER TABLE "Bug" ADD COLUMN "judgingFeedback" JSONB;

ALTER TABLE "Delivery"
  ADD COLUMN "judgingState" TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN "judgedHeadSha" TEXT,
  ADD COLUMN "judgingRound" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Delivery"
  ADD CONSTRAINT "Delivery_judgingState_check" CHECK ("judgingState" IN ('open', 'passed', 'rejected')),
  ADD CONSTRAINT "Delivery_judgingRound_check" CHECK ("judgingRound" > 0);

CREATE TABLE "JudgingVerdict" (
  "id" TEXT NOT NULL,
  "bugId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "deliveryRound" INTEGER NOT NULL,
  "agentId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "headSha" TEXT,
  "approved" BOOLEAN NOT NULL,
  "checks" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "notes" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JudgingVerdict_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JudgingVerdict_deliveryRound_check" CHECK ("deliveryRound" > 0)
);

CREATE UNIQUE INDEX "JudgingVerdict_deliveryId_deliveryRound_agentId_key"
  ON "JudgingVerdict"("deliveryId", "deliveryRound", "agentId");
CREATE UNIQUE INDEX "JudgingVerdict_deliveryId_deliveryRound_ownerId_key"
  ON "JudgingVerdict"("deliveryId", "deliveryRound", "ownerId");
CREATE INDEX "JudgingVerdict_bugId_createdAt_idx" ON "JudgingVerdict"("bugId", "createdAt");
CREATE INDEX "JudgingVerdict_deliveryId_deliveryRound_createdAt_idx"
  ON "JudgingVerdict"("deliveryId", "deliveryRound", "createdAt");

ALTER TABLE "JudgingVerdict"
  ADD CONSTRAINT "JudgingVerdict_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "JudgingVerdict_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "JudgingVerdict_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "JudgingVerdict_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "JudgingEvent" (
  "id" TEXT NOT NULL,
  "bugId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "deliveryRound" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "outcome" TEXT,
  "agentId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JudgingEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JudgingEvent_deliveryRound_check" CHECK ("deliveryRound" > 0),
  CONSTRAINT "JudgingEvent_type_check" CHECK ("type" IN ('verdict_submitted', 'passed', 'rejected')),
  CONSTRAINT "JudgingEvent_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('approve', 'send_back'))
);

CREATE INDEX "JudgingEvent_bugId_createdAt_idx" ON "JudgingEvent"("bugId", "createdAt");
CREATE INDEX "JudgingEvent_deliveryId_deliveryRound_createdAt_idx"
  ON "JudgingEvent"("deliveryId", "deliveryRound", "createdAt");
CREATE UNIQUE INDEX "JudgingEvent_one_resolution_per_round_key"
  ON "JudgingEvent"("deliveryId", "deliveryRound")
  WHERE "type" IN ('passed', 'rejected');

ALTER TABLE "JudgingEvent"
  ADD CONSTRAINT "JudgingEvent_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "JudgingEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "JudgingEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "JudgingEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
