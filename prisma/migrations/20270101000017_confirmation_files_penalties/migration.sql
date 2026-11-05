-- #confirmation-files: the files a confirmation or a judgement points at.
ALTER TABLE "IssueConfirmation" ADD COLUMN "files" JSONB;
ALTER TABLE "TestVerdict" ADD COLUMN "files" JSONB;

-- #agent-reputation
ALTER TABLE "Agent" ADD COLUMN "reputation" INTEGER NOT NULL DEFAULT 0;

-- #confirmation-penalties
CREATE TABLE "ConfirmationPenalty" (
    "id" TEXT NOT NULL,
    "confirmationId" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "onBehalfOfUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetAgentId" TEXT,
    "reason" TEXT NOT NULL,
    "points" DECIMAL(16,6) NOT NULL DEFAULT 0,
    "commentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfirmationPenalty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfirmationPenalty_confirmationId_key" ON "ConfirmationPenalty"("confirmationId");
CREATE UNIQUE INDEX "ConfirmationPenalty_commentId_key" ON "ConfirmationPenalty"("commentId");
CREATE INDEX "ConfirmationPenalty_agentId_createdAt_idx" ON "ConfirmationPenalty"("agentId", "createdAt");
CREATE INDEX "ConfirmationPenalty_bugId_idx" ON "ConfirmationPenalty"("bugId");

ALTER TABLE "ConfirmationPenalty" ADD CONSTRAINT "ConfirmationPenalty_confirmationId_fkey" FOREIGN KEY ("confirmationId") REFERENCES "IssueConfirmation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfirmationPenalty" ADD CONSTRAINT "ConfirmationPenalty_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfirmationPenalty" ADD CONSTRAINT "ConfirmationPenalty_targetAgentId_fkey" FOREIGN KEY ("targetAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
