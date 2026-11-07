import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project-route";
import { issuePath } from "@/lib/issue-ref";
import { groupReleases, releaseWhere, type ReleaseRow } from "@/lib/releases";

export const metadata = { title: "Releases" };
export const dynamic = "force-dynamic";

const LIMIT = 100;

/**
 * Releases (#872): the issues that went Live in this project, grouped by day, each linked to its issue and pull
 * request. Built from resolved issues; nothing is written here.
 */
export default async function ReleasesPage({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project: slug } = await params;
  const { project } = await requireProject(org, slug);
  const bugs = await prisma.bug.findMany({
    where: { projectId: project.id, status: "resolved", isDeleted: false, track: "product" },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: LIMIT,
    select: {
      id: true,
      number: true,
      title: true,
      substatus: true,
      updatedAt: true,
      pullRequestUrl: true,
      type: { select: { name: true } },
      pullRequestReports: { where: { state: "merged" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  const rows: ReleaseRow[] = bugs.map((bug) => ({
    id: bug.id,
    number: bug.number,
    title: bug.title,
    substatus: bug.substatus,
    typeName: bug.type?.name ?? null,
    pullRequestUrl: bug.pullRequestUrl,
    at: bug.pullRequestReports[0]?.createdAt ?? bug.updatedAt,
  }));
  const days = groupReleases(rows);

  return (
    <main className="mx-auto max-w-4xl space-y-6 text-zk-text [overflow-wrap:anywhere]">
      <div>
        <h1 className="text-2xl font-bold">Releases</h1>
        <p className="mt-2 text-sm text-zk-text2">
          What went Live in {project.name}, newest first. A day is when the fix was reported merged, else when the issue last changed.
        </p>
      </div>
      {days.length === 0 ? (
        <p className="rounded-2xl bg-zk-chip px-4 py-3 text-sm text-zk-text2">Nothing has gone Live in this project yet.</p>
      ) : (
        days.map((day) => (
          <section key={day.day} aria-labelledby={`day-${day.day}`} className="space-y-2">
            <h2 id={`day-${day.day}`} className="text-xs font-bold uppercase tracking-[0.08em] text-zk-muted">{day.day}</h2>
            <ul className="m-0 list-none divide-y divide-zk-border rounded-2xl border border-zk-border bg-zk-surface p-0">
              {day.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <Link href={issuePath(project.ref, item.number)} className="font-semibold text-zk-accent hover:underline">#{item.number}</Link>
                  <span className="min-w-0 flex-1 text-zk-text">{item.title}</span>
                  {item.typeName ? <span className="rounded-full bg-zk-chip px-2 py-0.5 text-xs text-zk-text2">{item.typeName}</span> : null}
                  <span className="rounded-full bg-zk-ok-bg px-2 py-0.5 text-xs font-semibold text-zk-ok-fg">{releaseWhere(item.substatus)}</span>
                  {item.pullRequestUrl ? <a href={item.pullRequestUrl} className="text-xs text-zk-text2 underline" rel="noreferrer">Pull request</a> : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {bugs.length === LIMIT ? <p className="text-sm text-zk-text2">Showing the {LIMIT} most recent. Older releases are not listed.</p> : null}
    </main>
  );
}
