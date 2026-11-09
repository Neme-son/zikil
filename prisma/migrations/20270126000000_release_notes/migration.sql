-- #release-notes: auto-generated release notes from resolved issues.
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Release_projectId_status_idx" ON "Release"("projectId", "status");

ALTER TABLE "Release" ADD CONSTRAINT "Release_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bug" ADD COLUMN "releaseId" TEXT;

CREATE INDEX "Bug_releaseId_idx" ON "Bug"("releaseId");

ALTER TABLE "Bug" ADD CONSTRAINT "Bug_releaseId_fkey"
FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;
