-- #stakes: fast claims on ideas and issues, their contest votes, and the per-project caps.
-- CreateEnum
CREATE TYPE "StakeStatus" AS ENUM ('waiting', 'open', 'contested', 'won', 'lost', 'dropped');

-- AlterTable
ALTER TABLE "ProjectWorkflow" ADD COLUMN     "stakeInProgressLimit" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "stakeLimit" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "IssueStake" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ideaId" TEXT,
    "bugId" TEXT,
    "agentId" TEXT NOT NULL,
    "beneficiaryUserId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "StakeStatus" NOT NULL DEFAULT 'open',
    "lastRefreshAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowEndsAt" TIMESTAMP(3),
    "contestEndsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueStake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeVote" (
    "id" TEXT NOT NULL,
    "stakeId" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "onBehalfOfUserId" TEXT NOT NULL,
    "agentId" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakeVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssueStake_claimId_key" ON "IssueStake"("claimId");

-- CreateIndex
CREATE INDEX "IssueStake_bugId_status_idx" ON "IssueStake"("bugId", "status");

-- CreateIndex
CREATE INDEX "IssueStake_ideaId_status_idx" ON "IssueStake"("ideaId", "status");

-- CreateIndex
CREATE INDEX "IssueStake_beneficiaryUserId_status_idx" ON "IssueStake"("beneficiaryUserId", "status");

-- CreateIndex
CREATE INDEX "IssueStake_status_windowEndsAt_idx" ON "IssueStake"("status", "windowEndsAt");

-- CreateIndex
CREATE INDEX "StakeVote_stakeId_idx" ON "StakeVote"("stakeId");

-- CreateIndex
CREATE UNIQUE INDEX "StakeVote_bugId_onBehalfOfUserId_key" ON "StakeVote"("bugId", "onBehalfOfUserId");

-- AddForeignKey
ALTER TABLE "IssueStake" ADD CONSTRAINT "IssueStake_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueStake" ADD CONSTRAINT "IssueStake_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueStake" ADD CONSTRAINT "IssueStake_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueStake" ADD CONSTRAINT "IssueStake_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "IssueClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeVote" ADD CONSTRAINT "StakeVote_stakeId_fkey" FOREIGN KEY ("stakeId") REFERENCES "IssueStake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
