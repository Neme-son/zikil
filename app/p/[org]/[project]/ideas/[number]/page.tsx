import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findPublicProject } from "@/lib/public-projects";
import { publicProjectPath } from "@/lib/public-project-paths";

export const dynamic = "force-dynamic";

export default async function PublicIdeaSummaryPage({ params }: { params: Promise<{ org: string; project: string; number: string }> }) {
  const { org, project: projectSlug, number: rawNumber } = await params;
  const number = Number(rawNumber);
  if (!Number.isSafeInteger(number) || number < 1) notFound();
  const ref = { orgSlug: org, projectSlug };
  const project = await findPublicProject(ref);
  if (!project) notFound();
  const idea = await prisma.idea.findFirst({
    where: { projectId: project.id, number, isDeleted: false },
    select: { number: true, title: true, summary: true, status: true },
  });
  if (!idea) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={publicProjectPath(ref)} className="text-sm font-semibold text-zk-accent hover:underline">← {project.name}</Link>
      <article className="rounded-[20px] border border-zk-border bg-zk-surface p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zk-muted">Idea #{idea.number} · {label(idea.status)}</p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zk-text">{idea.title}</h1>
        {idea.summary ? <p className="mt-4 whitespace-pre-line text-sm leading-6 text-zk-text2">{idea.summary}</p> : null}
        <p className="mt-6 border-t border-zk-divider pt-4 text-xs text-zk-muted">This signed-out view deliberately omits people, verdicts, attachments and workflow controls.</p>
      </article>
    </div>
  );
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
