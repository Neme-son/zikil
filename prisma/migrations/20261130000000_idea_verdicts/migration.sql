-- Ideas take verdicts instead of upvotes (#idea-verdicts). Each person gives an
-- idea a good, bad or neutral verdict carrying 1 vote (up to 5 for a manager
-- or merger agent). When good minus bad reaches the project's ideaThreshold, a
-- manager agent converts the idea to an issue. Issues then only need
-- confirmation; idea verdicts do not carry over.

-- CreateEnum
CREATE TYPE "IdeaOpinion" AS ENUM ('good', 'bad', 'neutral');

-- AlterTable
ALTER TABLE "Bug" ADD COLUMN     "convertedByAgentId" TEXT,
ADD COLUMN     "convertedToIssueAt" TIMESTAMP(3),
ADD COLUMN     "ideaScore" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProjectWorkflow" ADD COLUMN     "ideaThreshold" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "IdeaVerdict" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "onBehalfOfUserId" TEXT NOT NULL,
    "agentId" TEXT,
    "opinion" "IdeaOpinion" NOT NULL,
    "votes" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT NOT NULL,
    "commentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdeaVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdeaVerdict_commentId_key" ON "IdeaVerdict"("commentId");

-- CreateIndex
CREATE INDEX "IdeaVerdict_bugId_idx" ON "IdeaVerdict"("bugId");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaVerdict_bugId_onBehalfOfUserId_key" ON "IdeaVerdict"("bugId", "onBehalfOfUserId");

-- AddForeignKey
ALTER TABLE "IdeaVerdict" ADD CONSTRAINT "IdeaVerdict_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaVerdict" ADD CONSTRAINT "IdeaVerdict_onBehalfOfUserId_fkey" FOREIGN KEY ("onBehalfOfUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaVerdict" ADD CONSTRAINT "IdeaVerdict_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaVerdict" ADD CONSTRAINT "IdeaVerdict_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 1. Everything that is an issue today is converted: work has started on it, it
--    is resolved, or it is confirmed (2 independent "real" accepts and an
--    independent duplicate clearance after the latest edit) with 3 upvotes,
--    or confirmed and no longer open. Everything else stays an idea.
WITH latest_revision AS (
  SELECT "bugId", max("editedAt") AS at FROM "BugRevision" GROUP BY "bugId"
),
independent AS (
  SELECT v."bugId", v."kind"::text AS kind, v."verdict"::text AS verdict, a."ownerUserId"
  FROM "IssueValidation" v
  JOIN "Agent" a ON a."id" = v."agentId"
  JOIN "Bug" b ON b."id" = v."bugId"
  LEFT JOIN latest_revision r ON r."bugId" = v."bugId"
  WHERE v."agentId" IS DISTINCT FROM b."createdByAgentId"
    AND a."ownerUserId" <> b."reporterId"
    AND a."ownerUserId" IS DISTINCT FROM b."beneficiaryUserId"
    AND (r.at IS NULL OR v."createdAt" > r.at)
),
confirmed AS (
  SELECT b."id"
  FROM "Bug" b
  LEFT JOIN "ProjectWorkflow" w ON w."projectId" = b."projectId"
  WHERE (
      SELECT count(DISTINCT i."ownerUserId") FROM independent i
      WHERE i."bugId" = b."id" AND i.kind = 'real' AND i.verdict = 'accept'
    ) >= COALESCE(w."confirmationsNeeded", 2)
    AND EXISTS (
      SELECT 1 FROM independent i
      WHERE i."bugId" = b."id" AND i.kind = 'duplicate' AND i.verdict = 'reject'
    )
)
UPDATE "Bug" b
SET "convertedToIssueAt" = b."updatedAt"
WHERE b."status"::text IN ('in_progress', 'resolved')
   OR (b."id" IN (SELECT "id" FROM confirmed) AND (b."voteCount" >= 3 OR b."status"::text <> 'open'))
   OR b."assigneeId" IS NOT NULL
   OR b."pullRequestUrl" IS NOT NULL
   OR EXISTS (
     SELECT 1 FROM "IssueClaim" c
     WHERE c."bugId" = b."id" AND c."releasedAt" IS NULL AND c."status"::text IN ('active', 'offered')
   );

-- 2. An upvote on an idea becomes a good verdict with the same weight (a
--    manager agent's upvote was stored as 5). Old downvotes no longer counted
--    and are skipped, as are upvotes on the voter's own idea.
INSERT INTO "IdeaVerdict" ("id", "bugId", "onBehalfOfUserId", "agentId", "opinion", "votes", "summary", "createdAt", "updatedAt")
SELECT 'migrated-vote-' || v."id", v."bugId", v."userId", NULL, 'good', LEAST(v."value", 5),
       'Upvoted this idea before idea verdicts existed.', v."createdAt", now()
FROM "Vote" v
JOIN "Bug" b ON b."id" = v."bugId"
WHERE b."convertedToIssueAt" IS NULL
  AND v."value" > 0
  AND v."userId" <> b."reporterId"
  AND v."userId" IS DISTINCT FROM b."beneficiaryUserId"
ON CONFLICT ("bugId", "onBehalfOfUserId") DO NOTHING;

-- 3. A "real" validation on an idea becomes that person's verdict: accept is
--    good, reject is bad. It replaces their migrated upvote, because it says
--    more. The first sentence of its notes becomes the summary. With several
--    agents of one person, the latest validation wins.
INSERT INTO "IdeaVerdict" ("id", "bugId", "onBehalfOfUserId", "agentId", "opinion", "votes", "summary", "createdAt", "updatedAt")
SELECT DISTINCT ON (v."bugId", v."onBehalfOfUserId")
       'migrated-validation-' || v."id", v."bugId", v."onBehalfOfUserId", v."agentId",
       (CASE v."verdict"::text WHEN 'accept' THEN 'good' ELSE 'bad' END)::"IdeaOpinion", 1,
       COALESCE(
         substring(btrim(v."notes") FROM '^[^.!?]{1,250}[.!?]'),
         CASE v."verdict"::text
           WHEN 'accept' THEN 'Confirmed this as real before idea verdicts existed.'
           ELSE 'Judged this not real before idea verdicts existed.'
         END
       ),
       v."createdAt", now()
FROM "IssueValidation" v
JOIN "Bug" b ON b."id" = v."bugId"
WHERE b."convertedToIssueAt" IS NULL
  AND v."kind"::text = 'real'
  AND v."onBehalfOfUserId" <> b."reporterId"
  AND v."onBehalfOfUserId" IS DISTINCT FROM b."beneficiaryUserId"
ORDER BY v."bugId", v."onBehalfOfUserId", v."createdAt" DESC
ON CONFLICT ("bugId", "onBehalfOfUserId") DO UPDATE
SET "id" = EXCLUDED."id", "agentId" = EXCLUDED."agentId", "opinion" = EXCLUDED."opinion",
    "votes" = EXCLUDED."votes", "summary" = EXCLUDED."summary", "updatedAt" = now();

-- 4. Those "real" validations moved to verdicts, so they no longer count
--    toward confirming the issue later. Record each one first so the move can
--    be audited or reversed. Duplicate checks stay as they are.
INSERT INTO "AgentAuditEvent" ("id", "tenantId", "agentId", "action", "target", "bugId", "payload", "createdAt")
SELECT 'migrated-validation-' || v."id", b."tenantId", v."agentId", 'validation.migrated_to_idea_verdict', v."id", v."bugId",
       jsonb_build_object(
         'kind', v."kind"::text, 'verdict', v."verdict"::text, 'notes', v."notes",
         'severity', v."severity"::text, 'onBehalfOfUserId', v."onBehalfOfUserId",
         'createdAt', v."createdAt"
       ),
       now()
FROM "IssueValidation" v
JOIN "Bug" b ON b."id" = v."bugId"
WHERE b."convertedToIssueAt" IS NULL AND v."kind"::text = 'real';

DELETE FROM "IssueValidation" v
USING "Bug" b
WHERE b."id" = v."bugId" AND b."convertedToIssueAt" IS NULL AND v."kind"::text = 'real';

-- 5. Each idea's net score: good votes minus bad votes.
UPDATE "Bug" b
SET "ideaScore" = s.score
FROM (
  SELECT "bugId",
         sum(CASE "opinion"::text WHEN 'good' THEN "votes" WHEN 'bad' THEN -"votes" ELSE 0 END)::int AS score
  FROM "IdeaVerdict"
  GROUP BY "bugId"
) s
WHERE s."bugId" = b."id";
