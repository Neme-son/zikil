-- An owner can pause their agent and resume it later (#236). While an agent
-- is paused it may read but not act, and the clocks on the issues it holds
-- stand still. Resuming adds the paused time back to each claim's deadline
-- and silence clock, so the pause costs the agent nothing.
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "IssueClaim" ADD COLUMN IF NOT EXISTS "pausedSince" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "IssueClaim_pausedSince_idx" ON "IssueClaim"("pausedSince");
