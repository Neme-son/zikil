-- #idea-table: an idea is not an issue. Ideas move out of "Bug" into their
-- own table, numbered per tenant apart from issues. Converting an idea
-- creates the issue; the idea stays as the record of its verdicts.
--
-- Data:
-- - Every unconverted Bug row becomes an Idea with the SAME id, so links by
--   id still resolve, and keeps its old number in "legacyBugNumber", so links
--   by number redirect. Its comments (ideas took them before verdicts) are
--   kept as JSON in "legacyComments". Its attachments, verdicts, points and
--   idempotency keys move to the idea. Then the Bug row is deleted.
-- - Every converted Bug row gets an Idea (status converted) linked to it, so
--   its verdicts keep a home.
-- Issue numbers are not reused: the moved ideas leave gaps.

CREATE TYPE "IdeaStatus" AS ENUM ('open', 'converted', 'closed');

CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IdeaStatus" NOT NULL DEFAULT 'open',
    "score" INTEGER NOT NULL DEFAULT 0,
    "typeId" TEXT,
    "categoryId" TEXT,
    "areaId" TEXT,
    "proofLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "beneficiaryUserId" TEXT NOT NULL,
    "createdByAgentId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedByAgentId" TEXT,
    "issueId" TEXT,
    "legacyBugNumber" INTEGER,
    "legacyComments" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Tenant" ADD COLUMN "nextIdeaNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Attachment" ADD COLUMN "ideaId" TEXT;
ALTER TABLE "PointEntry" ADD COLUMN "ideaId" TEXT;
ALTER TABLE "IdempotencyKey" ADD COLUMN "ideaId" TEXT;
ALTER TABLE "IdeaVerdict" ADD COLUMN "ideaId" TEXT;

-- Idea numbers are per tenant, the same way issue numbers are (#517).
CREATE OR REPLACE FUNCTION "assign_tenant_idea_number"() RETURNS trigger AS $$
DECLARE
  assigned integer;
BEGIN
  UPDATE "Tenant"
  SET "nextIdeaNumber" = "nextIdeaNumber" + 1
  WHERE "id" = NEW."tenantId"
  RETURNING "nextIdeaNumber" - 1 INTO assigned;

  NEW."number" := assigned;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Idea_assign_tenant_number"
BEFORE INSERT ON "Idea"
FOR EACH ROW EXECUTE FUNCTION "assign_tenant_idea_number"();

-- One idea per Bug row, oldest first so idea numbers follow the order they
-- were filed. Unconverted rows keep their id; converted rows get a new one.
INSERT INTO "Idea" (
  "id", "title", "description", "status", "score", "typeId", "categoryId", "areaId", "proofLinks",
  "tenantId", "projectId", "reporterId", "beneficiaryUserId", "createdByAgentId",
  "convertedAt", "convertedByAgentId", "issueId", "legacyBugNumber", "legacyComments",
  "isDeleted", "deletedAt", "createdAt", "updatedAt"
)
SELECT
  CASE WHEN b."convertedToIssueAt" IS NULL THEN b."id" ELSE 'idea-' || b."id" END,
  b."title",
  b."description",
  CASE
    WHEN b."convertedToIssueAt" IS NOT NULL THEN 'converted'::"IdeaStatus"
    WHEN b."status" = 'open' THEN 'open'::"IdeaStatus"
    ELSE 'closed'::"IdeaStatus"
  END,
  b."ideaScore",
  b."typeId",
  b."categoryId",
  b."areaId",
  b."proofLinks",
  b."tenantId",
  b."projectId",
  b."reporterId",
  b."beneficiaryUserId",
  b."createdByAgentId",
  b."convertedToIssueAt",
  b."convertedByAgentId",
  CASE WHEN b."convertedToIssueAt" IS NULL THEN NULL ELSE b."id" END,
  CASE WHEN b."convertedToIssueAt" IS NULL THEN b."number" ELSE NULL END,
  CASE WHEN b."convertedToIssueAt" IS NULL THEN (
    SELECT jsonb_agg(
      jsonb_build_object('authorId', c."authorId", 'body', c."body", 'createdAt', c."createdAt")
      ORDER BY c."createdAt"
    )
    FROM "Comment" c
    WHERE c."bugId" = b."id" AND c."deletedAt" IS NULL
  ) ELSE NULL END,
  b."isDeleted",
  b."deletedAt",
  b."createdAt",
  b."updatedAt"
FROM "Bug" b
ORDER BY b."createdAt", b."id";

-- Verdicts follow their idea.
UPDATE "IdeaVerdict" v SET "ideaId" = i."id"
FROM "Idea" i
WHERE v."bugId" = COALESCE(i."issueId", i."id");

-- Attachments, points and idempotency keys of the moved ideas. The Bug link
-- on attachments is cleared first: deleting the Bug row would cascade to them.
UPDATE "Attachment" a SET "ideaId" = i."id", "bugId" = NULL
FROM "Idea" i
WHERE i."issueId" IS NULL AND a."bugId" = i."id";

UPDATE "PointEntry" p SET "ideaId" = i."id"
FROM "Idea" i
WHERE (i."issueId" IS NULL AND p."bugId" = i."id")
   OR (p."role" = 'idea' AND p."bugId" = i."issueId");

UPDATE "IdempotencyKey" k SET "ideaId" = i."id"
FROM "Idea" i
WHERE i."issueId" IS NULL AND k."bugId" = i."id";

-- Verdicts hang off the idea alone. The Bug link goes first: deleting the
-- moved rows below would otherwise cascade to their verdicts.
ALTER TABLE "IdeaVerdict" DROP CONSTRAINT "IdeaVerdict_bugId_fkey";

-- The moved ideas are no longer issues.
DELETE FROM "Bug" b
USING "Idea" i
WHERE i."issueId" IS NULL AND b."id" = i."id";

DROP INDEX "IdeaVerdict_bugId_idx";
DROP INDEX "IdeaVerdict_bugId_onBehalfOfUserId_key";
DELETE FROM "IdeaVerdict" WHERE "ideaId" IS NULL;
ALTER TABLE "IdeaVerdict" DROP COLUMN "bugId";
ALTER TABLE "IdeaVerdict" ALTER COLUMN "ideaId" SET NOT NULL;

ALTER TABLE "Bug" DROP COLUMN "convertedByAgentId",
DROP COLUMN "convertedToIssueAt",
DROP COLUMN "ideaScore";

CREATE UNIQUE INDEX "Idea_issueId_key" ON "Idea"("issueId");
CREATE INDEX "Idea_tenantId_projectId_status_idx" ON "Idea"("tenantId", "projectId", "status");
CREATE INDEX "Idea_reporterId_idx" ON "Idea"("reporterId");
CREATE INDEX "Idea_createdByAgentId_idx" ON "Idea"("createdByAgentId");
CREATE UNIQUE INDEX "Idea_tenantId_number_key" ON "Idea"("tenantId", "number");
CREATE UNIQUE INDEX "Idea_tenantId_legacyBugNumber_key" ON "Idea"("tenantId", "legacyBugNumber");
CREATE INDEX "Attachment_ideaId_idx" ON "Attachment"("ideaId");

-- The similar-title check searches open ideas as well as issues.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Idea_title_trgm_idx" ON "Idea" USING gin ("title" gin_trgm_ops)';
  END IF;
END $$;
CREATE INDEX "IdeaVerdict_ideaId_idx" ON "IdeaVerdict"("ideaId");
CREATE UNIQUE INDEX "IdeaVerdict_ideaId_onBehalfOfUserId_key" ON "IdeaVerdict"("ideaId", "onBehalfOfUserId");

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "IssueType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "ProjectArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_beneficiaryUserId_fkey" FOREIGN KEY ("beneficiaryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Bug"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IdeaVerdict" ADD CONSTRAINT "IdeaVerdict_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
