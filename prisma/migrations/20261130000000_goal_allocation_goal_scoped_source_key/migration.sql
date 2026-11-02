-- DropIndex
DROP INDEX IF EXISTS "GoalAllocation_sourceKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "GoalAllocation_goalId_sourceKey_key" ON "GoalAllocation"("goalId", "sourceKey");
