"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { bugInOrganisation, currentOrganisationIdFor } from "@/lib/organisation-context";
import { revalidateIssue } from "@/lib/revalidate-issue";

export type FavoriteActionResult = { ok?: true; error?: string; favorited?: boolean };

export async function toggleFavoriteAction(bugId: string): Promise<FavoriteActionResult> {
  const user = await requireUser();
  const organisationId = await currentOrganisationIdFor(user.id);
  if (!organisationId) return { error: "Select an organization first." };

  const bug = await prisma.bug.findFirst({
    where: { id: bugId, ...bugInOrganisation(organisationId), isDeleted: false },
    select: { id: true },
  });
  if (!bug) return { error: "This issue no longer exists or was deleted." };

  const existing = await prisma.issueFavorite.findUnique({
    where: { userId_bugId: { userId: user.id, bugId } },
  });

  if (existing) {
    await prisma.issueFavorite.delete({ where: { id: existing.id } });
    revalidateIssue();
    revalidatePath("/[project]", "layout");
    return { ok: true, favorited: false };
  } else {
    await prisma.issueFavorite.create({ data: { userId: user.id, bugId } });
    revalidateIssue();
    revalidatePath("/[project]", "layout");
    return { ok: true, favorited: true };
  }
}

export async function isFavorited(bugId: string, userId: string): Promise<boolean> {
  const fav = await prisma.issueFavorite.findUnique({
    where: { userId_bugId: { userId, bugId } },
  });
  return !!fav;
}
