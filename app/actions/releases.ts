"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { bugInOrganisation, currentOrganisationIdFor } from "@/lib/organisation-context";
import { currentOrganisationAccess } from "@/lib/organisation-access";
import { revalidateIssue } from "@/lib/revalidate-issue";
import { generateReleaseNotes, validateReleaseTitle } from "@/lib/release-notes";

export type ReleaseActionResult = { ok?: true; error?: string; releaseId?: string };

async function requireOrgAdmin() {
  const user = await requireUser();
  const access = await currentOrganisationAccess(user.id, user.role);
  if (!access.admin) return { error: "Only an owner or admin can manage releases." };
  return { user };
}

function revalidate() {
  revalidateIssue();
  revalidatePath("/[project]", "layout");
}

/** Create a new draft release and auto-collect resolved issues. */
export async function createReleaseAction(projectId: string, title: string): Promise<ReleaseActionResult> {
  const gate = await requireOrgAdmin();
  if ("error" in gate) return { error: gate.error };
  const organisationId = await currentOrganisationIdFor(gate.user.id);
  if (!organisationId) return { error: "Select an organization first." };

  const project = await prisma.project.findFirst({
    where: { id: projectId, organisationId },
    select: { id: true },
  });
  if (!project) return { error: "That project doesn't exist." };

  const validated = validateReleaseTitle(title);
  if (!validated.ok) return { error: validated.error };

  try {
    // Find resolved issues not yet in a release.
    const resolvedIssues = await prisma.bug.findMany({
      where: { projectId, status: "resolved", releaseId: null, isDeleted: false },
      select: { id: true, number: true, title: true, type: { select: { name: true } }, status: true },
    });

    const release = await prisma.release.create({
      data: {
        projectId,
        title: validated.title,
        status: "draft",
        body: generateReleaseNotes(validated.title, resolvedIssues.map((i) => ({
          number: i.number,
          title: i.title,
          type: i.type?.name ?? null,
          status: i.status,
        }))),
      },
      select: { id: true },
    });

    // Assign resolved issues to this release.
    if (resolvedIssues.length > 0) {
      await prisma.bug.updateMany({
        where: { id: { in: resolvedIssues.map((i) => i.id) } },
        data: { releaseId: release.id },
      });
    }

    return { ok: true, releaseId: release.id };
  } catch (error) {
    console.error("Failed to create release:", error);
    return { error: "Failed to create the release." };
  }
}

/** Publish a draft release. */
export async function publishReleaseAction(releaseId: string): Promise<ReleaseActionResult> {
  const gate = await requireOrgAdmin();
  if ("error" in gate) return { error: gate.error };
  const organisationId = await currentOrganisationIdFor(gate.user.id);
  if (!organisationId) return { error: "Select an organization first." };

  const release = await prisma.release.findFirst({
    where: { id: releaseId, project: { organisationId } },
    select: { id: true, title: true, status: true },
  });
  if (!release) return { error: "That release doesn't exist." };
  if (release.status === "published") return { ok: true };

  await prisma.release.update({
    where: { id: release.id },
    data: { status: "published", publishedAt: new Date() },
  });
  revalidate();
  return { ok: true };
}

/** Delete a draft release (unassigns issues). */
export async function deleteReleaseAction(releaseId: string): Promise<ReleaseActionResult> {
  const gate = await requireOrgAdmin();
  if ("error" in gate) return { error: gate.error };
  const organisationId = await currentOrganisationIdFor(gate.user.id);
  if (!organisationId) return { error: "Select an organization first." };

  const release = await prisma.release.findFirst({
    where: { id: releaseId, project: { organisationId } },
    select: { id: true, status: true },
  });
  if (!release) return { ok: true };
  if (release.status === "published") return { error: "Cannot delete a published release." };

  await prisma.$transaction(async (tx) => {
    await tx.bug.updateMany({ where: { releaseId: release.id }, data: { releaseId: null } });
    await tx.release.delete({ where: { id: release.id } });
  });
  revalidate();
  return { ok: true };
}

/**
 * Auto-add a resolved issue to the current draft release (if any).
 * Called when an issue transitions to resolved.
 */
export async function autoAddToRelease(bugId: string, projectId: string): Promise<void> {
  try {
    const draft = await prisma.release.findFirst({
      where: { projectId, status: "draft" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    });
    if (!draft) return;

    await prisma.bug.update({ where: { id: bugId }, data: { releaseId: draft.id } });

    // Regenerate body.
    const issues = await prisma.bug.findMany({
      where: { releaseId: draft.id, isDeleted: false },
      select: { number: true, title: true, type: { select: { name: true } }, status: true },
    });
    const body = generateReleaseNotes(draft.title, issues.map((i) => ({
      number: i.number,
      title: i.title,
      type: i.type?.name ?? null,
      status: i.status,
    })));
    await prisma.release.update({ where: { id: draft.id }, data: { body } });
  } catch (error) {
    console.error("Auto-add to release failed:", error);
  }
}
