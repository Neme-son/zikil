import type { Prisma, PrismaClient } from "@prisma/client";
import { ideasPath, marketingPath, type ProjectRef } from "@/lib/project-paths";
import { MARKETING_TRACK, PRODUCT_TRACK } from "@/lib/marketing/track";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Whether a project is all marketing (#marketing-home): it has marketing work
 * and no product work, like Ziki's Marketing project. A product project that
 * also has a few marketing tasks is not one.
 */
export async function isMarketingProject(db: Db, projectId: string): Promise<boolean> {
  const [marketing, product] = await Promise.all([
    db.bug.findFirst({ where: { projectId, isDeleted: false, ...MARKETING_TRACK }, select: { id: true } }),
    db.bug.findFirst({ where: { projectId, isDeleted: false, ...PRODUCT_TRACK }, select: { id: true } }),
  ]);
  return Boolean(marketing) && !product;
}

/** Where a project opens (`/<org>/<project>`): its Marketing tab when it is all marketing, else its Ideas. */
export async function projectHomePath(db: Db, projectId: string, ref: ProjectRef): Promise<string> {
  return (await isMarketingProject(db, projectId)) ? marketingPath(ref) : ideasPath(ref);
}
