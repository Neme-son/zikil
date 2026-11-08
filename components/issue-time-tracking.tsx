import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { currentOrganisationAccess } from "@/lib/organisation-access";
import { TimeTrackingPanel } from "./time-tracking-panel";

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export async function IssueTimeTracking({ bugId }: { bugId: string }) {
  const user = await requireUser();
  const access = await currentOrganisationAccess(user.id, user.role);

  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    select: {
      status: true,
      inProgressStartedAt: true,
      activeMinutes: true,
    },
  });

  const entries = await prisma.timeEntry.findMany({
    where: { bugId },
    orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      minutes: true,
      note: true,
      spentOn: true,
      source: true,
      userId: true,
      user: { select: { name: true } },
    },
  });

  const isTracking = bug?.status === "in_progress" && !!bug.inProgressStartedAt;

  return (
    <TimeTrackingPanel
      bugId={bugId}
      isAdmin={access.admin}
      isTracking={isTracking}
      activeMinutes={bug?.activeMinutes ?? 0}
      startedAt={bug?.inProgressStartedAt?.toISOString() ?? null}
      entries={entries.map((entry) => ({
        id: entry.id,
        minutes: entry.minutes,
        note: entry.note,
        spentOnLabel: dayFormat.format(entry.spentOn),
        userId: entry.userId,
        userName: entry.user.name,
        source: entry.source,
      }))}
    />
  );
}
