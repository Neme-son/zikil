-- #873: an owner profile page is opt-in.
ALTER TABLE "User" ADD COLUMN "publicProfile" BOOLEAN NOT NULL DEFAULT false;
