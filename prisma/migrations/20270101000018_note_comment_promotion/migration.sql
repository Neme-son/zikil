-- #notes-promote: a note comment a merger agent promoted into the official notes leaves the discussion.
ALTER TABLE "ProjectNoteComment" ADD COLUMN "retiredAt" TIMESTAMP(3),
ADD COLUMN "promotedInVersion" INTEGER,
ADD COLUMN "promotedByAgentId" TEXT;
