-- Allow a project to connect multiple GitHub repositories (#675).
-- Each project can list additional repositories besides its main repoUrl.
-- Pull requests from any listed repository can be linked, accepted,
-- auto-merged and resolved. A PR in an unlisted repository is still refused.
CREATE TABLE "ProjectRepository" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "githubInstallationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRepository_pkey" PRIMARY KEY ("id")
);

-- Ensure no duplicate repository URLs per project.
CREATE UNIQUE INDEX "ProjectRepository_projectId_repoUrl_key"
ON "ProjectRepository"("projectId", "repoUrl");

-- Add foreign key to Project.
ALTER TABLE "ProjectRepository"
ADD CONSTRAINT "ProjectRepository_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
