import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findPublicProject } from "@/lib/public-projects";
import { publicProjectPath } from "@/lib/public-project-paths";

export const dynamic = "force-dynamic";

export default async function PublicIssueSummaryPage({ params }: { params: Promise<{ org: string; project: string; number: string }> }) {
  const { org, project: projectSlug, number: rawNumber } = await params;
  const number = Number(rawNumber);
  if (!Number.isSafeInteger(number) || number < 1) notFound();
  const ref = { orgSlug: org, projectSlug };
  const project = await findPublicProject(ref);
  if (!project) notFound();
  const issue = await prisma.bug.findFirst({
    where: { projectId: project.id, number, isDeleted: false },
    select: { number: true, title: true, summary: true, status: true, substatus: true },
  });
  if (!issue) notFound();
  return <PublicItem projectName={project.name} back={publicProjectPath(ref)} eyebrow={`Issue #${issue.number} · ${label(issue.substatus ?? issue.status)}`} title={issue.title} summary={issue.summary} />;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function PublicItem({ projectName, back, eyebrow, title, summary }: { projectName: string; back: string; eyebrow: string; title: string; summary: string | null }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={back} className="text-sm font-semibold text-zk-accent hover:underline">← {projectName}</Link>
      <article className="rounded-[20px] border border-zk-border bg-zk-surface p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zk-muted">{eyebrow}</p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zk-text">{title}</h1>
        {summary ? <p className="mt-4 whitespace-pre-line text-sm leading-6 text-zk-text2">{summary}</p> : null}
        <p className="mt-6 border-t border-zk-divider pt-4 text-xs text-zk-muted">This signed-out view deliberately omits people, comments, attachments and workflow controls.</p>
      </article>
    </div>
  );
}
