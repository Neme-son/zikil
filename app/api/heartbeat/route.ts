import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { bugInOrganisation, currentOrganisationIdFor } from "@/lib/organisation-context";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/time-tracking";

/**
 * Lightweight heartbeat endpoint for automated time tracking.
 * Called by the browser every 5 minutes while an issue is in progress
 * and the tab is visible. Increments activeMinutes on the Bug.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const organisationId = await currentOrganisationIdFor(user.id);
    if (!organisationId) {
      return NextResponse.json({ error: "No organisation" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const bugId = body?.bugId;
    if (typeof bugId !== "string" || !bugId) {
      return NextResponse.json({ error: "bugId required" }, { status: 400 });
    }

    const bug = await prisma.bug.findFirst({
      where: { id: bugId, ...bugInOrganisation(organisationId), isDeleted: false },
      select: { id: true, status: true, inProgressStartedAt: true, lastHeartbeatAt: true, activeMinutes: true },
    });
    if (!bug || bug.status !== "in_progress" || !bug.inProgressStartedAt) {
      return NextResponse.json({ ok: true, tracked: false });
    }

    const now = new Date();
    // Only count if at least 1 minute since last heartbeat (avoid spam).
    const sinceLast = bug.lastHeartbeatAt
      ? now.getTime() - bug.lastHeartbeatAt.getTime()
      : HEARTBEAT_INTERVAL_MS;
    if (sinceLast < 60_000) {
      return NextResponse.json({ ok: true, tracked: false });
    }

    await prisma.bug.update({
      where: { id: bug.id },
      data: {
        lastHeartbeatAt: now,
        activeMinutes: { increment: 1 },
      },
    });

    return NextResponse.json({ ok: true, tracked: true });
  } catch (error) {
    console.error("Heartbeat failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

