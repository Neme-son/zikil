import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { currentOrganisationIdFor } from "@/lib/organisation-context";
import { prisma } from "@/lib/prisma";
import { KanbanBoard } from "@/components/kanban-board";

export const metadata = { title: "Kanban board" };

export default async function BoardPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const user = await requireUser();
  const organisationId = await currentOrganisationIdFor(user.id);
  if (!organisationId) redirect("/organisations");
  const { org, project: projectSlug } = await params;
  const project = await prisma.project.findFirst({
    where: { organisationId, slug: projectSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!project) notFound();

  const issues = await prisma.bug.findMany({
    where: { projectId: project.id, isDeleted: false },
    orderBy: [{ isBoosted: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      assignee: { select: { id: true, name: true } },
      type: { select: { name: true } },
    },
    take: 200,
  });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 pb-10">
      <h1 className="text-2xl font-extrabold text-zk-text">{project.name} — Kanban board</h1>
      <p className="text-sm text-zk-muted">Drag issues between columns to change their status.</p>
      <KanbanBoard
        projectId={project.id}
        issues={issues.map((i) => ({
          id: i.id,
          number: i.number,
          title: i.title,
          status: i.status,
          priority: i.priority,
          assigneeName: i.assignee?.name ?? null,
          typeName: i.type?.name ?? null,
        }))}
      />
    </div>
  );
}
