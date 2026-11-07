import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/rich-text";
import { prisma } from "@/lib/prisma";
import { findPublicProject } from "@/lib/public-projects";
import { publicReportPath, publicWorkItemPath } from "@/lib/public-project-paths";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ org: string; project: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org, project } = await params;
  const found = await findPublicProject({ orgSlug: org, projectSlug: project });
  return found ? { title: `${found.name} public project`, description: found.goal ?? `Public work for ${found.name}.` } : {};
}

export default async function PublicProjectPage({ params }: Props) {
  const { org, project: projectSlug } = await params;
  const ref = { orgSlug: org, projectSlug };
  const project = await findPublicProject(ref);
  if (!project) notFound();

  const [issues, ideas] = await Promise.all([
    prisma.bug.findMany({
      where: { projectId: project.id, isDeleted: false, status: { notIn: ["closed"] } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 6,
      select: { number: true, title: true, summary: true, status: true, substatus: true },
    }),
    prisma.idea.findMany({
      where: { projectId: project.id, isDeleted: false, status: { in: ["open", "converted"] } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 6,
      select: { number: true, title: true, summary: true, status: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Link href="/discover" className="text-sm font-semibold text-zk-accent hover:underline">← Discover projects</Link>
      <header className="rounded-[24px] border border-zk-border bg-zk-surface p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zk-muted">{project.organisation.name}</p>
        <div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-extrabold tracking-tight text-zk-text">{project.name}</h1>
            {project.goal ? <RichText content={project.goal} className="mt-3 text-sm text-zk-text2" /> : null}
          </div>
          {project.acceptsGuestIdeas ? (
            <Link href={publicReportPath(ref)} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-zk-accent px-5 text-sm font-bold text-white hover:opacity-90">
              Submit an issue
            </Link>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
          {project.repoUrl ? <a href={project.repoUrl} target="_blank" rel="noreferrer" className="text-zk-accent hover:underline">Code ↗</a> : null}
          {project.siteUrl ? <a href={project.siteUrl} target="_blank" rel="noreferrer" className="text-zk-accent hover:underline">Website ↗</a> : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <PublicWorkList title="Recent issues" empty="No public issues yet." items={issues.map((issue) => ({
          key: `issue-${issue.number}`,
          href: publicWorkItemPath(ref, "issue", issue.number),
          title: issue.title,
          summary: issue.summary,
          meta: `Issue #${issue.number} · ${label(issue.substatus ?? issue.status)}`,
        }))} />
        <PublicWorkList title="Recent ideas" empty="No public ideas yet." items={ideas.map((idea) => ({
          key: `idea-${idea.number}`,
          href: publicWorkItemPath(ref, "idea", idea.number),
          title: idea.title,
          summary: idea.summary,
          meta: `Idea #${idea.number} · ${label(idea.status)}`,
        }))} />
      </div>
    </div>
  );
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function PublicWorkList({ title, empty, items }: {
  title: string;
  empty: string;
  items: Array<{ key: string; href: string; title: string; summary: string | null; meta: string }>;
}) {
  return (
    <section className="rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-6">
      <h2 className="text-lg font-bold text-zk-text">{title}</h2>
      {items.length === 0 ? <p className="mt-4 text-sm text-zk-muted">{empty}</p> : (
        <ul className="mt-4 divide-y divide-zk-divider">
          {items.map((item) => (
            <li key={item.key} className="py-4 first:pt-0 last:pb-0">
              <Link href={item.href} className="font-semibold text-zk-text hover:text-zk-accent hover:underline">{item.title}</Link>
              {item.summary ? <p className="mt-1 line-clamp-2 text-sm text-zk-text2">{item.summary}</p> : null}
              <p className="mt-2 text-xs text-zk-muted">{item.meta}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
