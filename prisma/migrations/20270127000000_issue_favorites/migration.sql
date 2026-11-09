-- #issue-favorites: user-bookmarked issues.
CREATE TABLE "IssueFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IssueFavorite_userId_bugId_key" ON "IssueFavorite"("userId", "bugId");
CREATE INDEX "IssueFavorite_userId_idx" ON "IssueFavorite"("userId");
CREATE INDEX "IssueFavorite_bugId_idx" ON "IssueFavorite"("bugId");

ALTER TABLE "IssueFavorite" ADD CONSTRAINT "IssueFavorite_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssueFavorite" ADD CONSTRAINT "IssueFavorite_bugId_fkey"
FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;
