-- #automation-rules: project-defined automation rules.
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL DEFAULT 'issue_updated',
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRule_projectId_enabled_idx" ON "AutomationRule"("projectId", "enabled");

ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AutomationLog" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'success',
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationLog_ruleId_createdAt_idx" ON "AutomationLog"("ruleId", "createdAt");
CREATE INDEX "AutomationLog_bugId_createdAt_idx" ON "AutomationLog"("bugId", "createdAt");

ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_bugId_fkey"
FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;
