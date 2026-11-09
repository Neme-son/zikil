-- Let an untouched converted issue return to its idea without reusing its issue number (#801).
ALTER TABLE "Bug"
  ADD COLUMN "demotedToIdeaId" TEXT;

CREATE UNIQUE INDEX "Bug_demotedToIdeaId_key" ON "Bug"("demotedToIdeaId");

ALTER TABLE "Bug"
  ADD CONSTRAINT "Bug_demotedToIdeaId_fkey"
  FOREIGN KEY ("demotedToIdeaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Idea"
  ADD COLUMN "demotedAt" TIMESTAMP(3),
  ADD COLUMN "demotedByAgentId" TEXT,
  ADD COLUMN "demotionSummary" TEXT,
  ADD COLUMN "demotionDescription" TEXT;

CREATE TABLE "IssueDemotionSuggestion" (
  "id" TEXT NOT NULL,
  "bugId" TEXT NOT NULL,
  "onBehalfOfUserId" TEXT NOT NULL,
  "agentId" TEXT,
  "votes" INTEGER NOT NULL DEFAULT 1,
  "summary" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IssueDemotionSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IssueDemotionSuggestion_bugId_onBehalfOfUserId_key"
  ON "IssueDemotionSuggestion"("bugId", "onBehalfOfUserId");
CREATE INDEX "IssueDemotionSuggestion_bugId_idx" ON "IssueDemotionSuggestion"("bugId");

ALTER TABLE "IssueDemotionSuggestion"
  ADD CONSTRAINT "IssueDemotionSuggestion_bugId_fkey"
  FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "IssueDemotionSuggestion_onBehalfOfUserId_fkey"
  FOREIGN KEY ("onBehalfOfUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "IssueDemotionSuggestion_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
