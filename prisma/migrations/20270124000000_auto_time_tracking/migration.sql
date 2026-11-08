-- #auto-time: automated time tracking from status transitions + heartbeats.
ALTER TABLE "TimeEntry" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE "Bug" ADD COLUMN "inProgressStartedAt" TIMESTAMP(3);
ALTER TABLE "Bug" ADD COLUMN "inProgressStartedBy" TEXT;
ALTER TABLE "Bug" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "Bug" ADD COLUMN "activeMinutes" INTEGER NOT NULL DEFAULT 0;
