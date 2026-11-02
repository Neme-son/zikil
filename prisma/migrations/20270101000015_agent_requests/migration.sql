-- What a person asked one of their agents to do (#agent-requests), until the agent marks it done.
CREATE TABLE IF NOT EXISTS "AgentRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),
    CONSTRAINT "AgentRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentRequest_agentId_doneAt_idx" ON "AgentRequest"("agentId", "doneAt");
ALTER TABLE "AgentRequest" DROP CONSTRAINT IF EXISTS "AgentRequest_agentId_fkey";
ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
