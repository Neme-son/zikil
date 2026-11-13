-- CreateTable
CREATE TABLE "TestCardOverride" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "squareKey" VARCHAR(260) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestCardOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestCardOverride_bugId_squareKey_key" ON "TestCardOverride"("bugId", "squareKey");

-- AddForeignKey
ALTER TABLE "TestCardOverride" ADD CONSTRAINT "TestCardOverride_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;
