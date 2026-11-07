import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/rich-text";
import { stateLabel, statusLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { findPublicProject, publicTrackingTokenHash } from "@/lib/public-projects";
import { publicProjectPath } from "@/lib/public-project-paths";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Track a public report", robots: { index: false, follow: false } };

export default async function PublicTrackingPage({ params }: { params: Promise<{ org: string; project: string; token: string }> }) {
  const { org, project: projectSlug, token } = await params;
  if (!/^[A-Za-z0-9_-]{32,200}$/.test(token)) notFound();
  const ref = { orgSlug: org, projectSlug };
  const project = await findPublicProject(ref);
  if (!project) notFound();
  const idea = await prisma.idea.findFirst({
    where: { projectId: project.id, publicTrackingTokenHash: publicTrackingTokenHash(token), source: "public", isDeleted: false },
    select: {
      number: true,
      title: true,
      summary: true,
      description: true,
      status: true,
      updatedAt: true,
      issue: { select: { number: true, status: true, substatus: true } },
    },
  });
  if (!idea) notFound();
  const state = idea.issue
    ? `Issue #${idea.issue.number} · ${idea.issue.substatus ? stateLabel(idea.issue.substatus) : statusLabel[idea.issue.status]}`
    : idea.status === "open" ? "Awaiting triage" : "Converted to an issue";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={publicProjectPath(ref)} className="text-sm font-semibold text-zk-accent hover:underline">← {project.name}</Link>
      <article className="rounded-[20px] border border-zk-border bg-zk-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-zk-muted">Idea #{idea.number}</p>
          <span className="rounded-full border border-zk-border bg-zk-chip px-3 py-1 text-xs font-semibold text-zk-text2">{state}</span>
        </div>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-zk-text">{idea.title}</h1>
        {idea.summary ? <p className="mt-3 whitespace-pre-line text-sm font-medium text-zk-text2">{idea.summary}</p> : null}
        <RichText content={idea.description} className="mt-6 text-sm text-zk-text" />
        <p className="mt-6 border-t border-zk-divider pt-4 text-xs text-zk-muted">Last updated {idea.updatedAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}. Keep this URL private; it is the key to this tracking page.</p>
      </article>
    </div>
  );
}
