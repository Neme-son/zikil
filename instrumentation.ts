export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPointsBackfill } = await import("@/lib/points/backfill-on-start");
    startPointsBackfill();

    const { startPlatformCron } = await import("@/lib/cron/scheduler");
    startPlatformCron();

    const { promoteSuperAdminsOnStart } = await import("@/lib/super-admin-on-start");
    void promoteSuperAdminsOnStart();
  }
}
