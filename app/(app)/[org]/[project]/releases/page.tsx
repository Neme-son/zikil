import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { currentOrganisationIdFor } from "@/lib/organisation-context";
import { prisma } from "@/lib/prisma";
import { ReleaseNotes } from "@/components/release-notes";

export const metadata = { title: "Release notes" };

export default async function ReleasesPage({
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

  const releases = await prisma.release.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, tag: true, status: true, body: true, createdAt: true, publishedAt: true, _count: { select: { issues: true } } },
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-10">
      <h1 className="text-2xl font-extrabold text-zk-text">{project.name} — Release notes</h1>
      <p className="text-sm text-zk-muted">Auto-generated from resolved issues.</p>
      <ReleaseNotes projectId={project.id} releases={releases.map((r) => ({
        id: r.id,
        title: r.title,
        tag: r.tag,
        status: r.status,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        publishedAt: r.publishedAt?.toISOString() ?? null,
        issueCount: r._count.issues,
      }))} />
    </div>
  );
}
