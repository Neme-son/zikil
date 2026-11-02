-- The robot avatar an agent's owner picked; null keeps the automatic one drawn from its id.
-- IF NOT EXISTS: databases that ran this under its earlier name already have the column.
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "avatar" TEXT;
