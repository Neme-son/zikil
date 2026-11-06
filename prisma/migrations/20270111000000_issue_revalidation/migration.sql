-- CreateEnum
CREATE TYPE "RevalidationVerdict" AS ENUM ('still_reproducible', 'possibly_fixed', 'no_longer_reproducible', 'feature_removed');

-- CreateEnum
CREATE TYPE "RevalidationTrigger" AS ENUM ('pull_request', 'commit', 'manual');

-- CreateTable
CREATE TABLE "IssueRepro" (
    "bugId" TEXT NOT NULL,
    "affectedPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affectedEndpoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "steps" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "actual" TEXT NOT NULL,
    "commitSha" TEXT,
    "agentId" TEXT NOT NULL,
    "onBehalfOfUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueRepro_pkey" PRIMARY KEY ("bugId")
);

-- CreateTable
CREATE TABLE "IssueRevalidation" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "trigger" "RevalidationTrigger" NOT NULL,
    "pullRequestUrl" TEXT,
    "commitSha" TEXT,
    "changedPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchedPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verdict" "RevalidationVerdict",
    "summary" TEXT,
    "description" TEXT,
    "agentId" TEXT NOT NULL,
    "onBehalfOfUserId" TEXT NOT NULL,
    "verdictAgentId" TEXT,
    "verdictOnBehalfOfUserId" TEXT,
    "verdictAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueRevalidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueRevalidation_bugId_createdAt_idx" ON "IssueRevalidation"("bugId", "createdAt");

-- CreateIndex
CREATE INDEX "IssueRevalidation_verdict_createdAt_idx" ON "IssueRevalidation"("verdict", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IssueRevalidation_bugId_commitSha_key" ON "IssueRevalidation"("bugId", "commitSha");

-- AddForeignKey
ALTER TABLE "IssueRepro" ADD CONSTRAINT "IssueRepro_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRepro" ADD CONSTRAINT "IssueRepro_onBehalfOfUserId_fkey" FOREIGN KEY ("onBehalfOfUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRepro" ADD CONSTRAINT "IssueRepro_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRevalidation" ADD CONSTRAINT "IssueRevalidation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRevalidation" ADD CONSTRAINT "IssueRevalidation_onBehalfOfUserId_fkey" FOREIGN KEY ("onBehalfOfUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRevalidation" ADD CONSTRAINT "IssueRevalidation_verdictAgentId_fkey" FOREIGN KEY ("verdictAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRevalidation" ADD CONSTRAINT "IssueRevalidation_verdictOnBehalfOfUserId_fkey" FOREIGN KEY ("verdictOnBehalfOfUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRevalidation" ADD CONSTRAINT "IssueRevalidation_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

