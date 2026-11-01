import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { bugInTenant, currentTenantIdFor } from "@/lib/tenant-context";
import { canDeleteTicket } from "@/lib/ticket-deletion";
import { currentTenantAccess } from "@/lib/tenant-access";
import { formatIssueNumber } from "@/lib/issue-number";
import { issuePath, parseIssueRef, queryString, resolveIssueRef } from "@/lib/issue-ref";
import { buildVersions } from "@/lib/issue-revisions";
import { LocalTime } from "@/components/local-time";
import { RichText } from "@/components/rich-text";
import { TextDiffView } from "@/components/text-diff-view";
import { wordDiff } from "@/lib/text-diff";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata = { title: "Edit history" };

/**
 * Every version of an issue's title and description (#303). Visible to
 * anyone who can see the issue, on the same rule as the issue page.
 */
export default async function IssueHistoryPage({ params, searchParams }: Props) {
  const { id: rawId } = await params;
  const user = await requireUser();
  const access = await currentTenantAccess(user.id, user.role);
  const scope = bugInTenant(await currentTenantIdFor(user.id));
  // #457: readable numbers resolve here; an old id redirects to the number,
  // keeping its query parameters.
  const ref = parseIssueRef(rawId);
  const found = await resolveIssueRef(prisma, ref, scope);
  if (!found) notFound();
  if (ref.kind === "id") {
    permanentRedirect(`${issuePath(found.number, "/history")}${queryString((await searchParams) ?? {})}`);
  }

  const bug = await prisma.bug.findUnique({
    where: { id: found.id, ...scope },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      createdAt: true,
      isDeleted: true,
      reporter: { select: { name: true } },
      revisions: {
        orderBy: { editedAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          editedAt: true,
          editedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!bug || (bug.isDeleted && !canDeleteTicket(user.role, access.membershipRole))) notFound();

  const versions = buildVersions(
    {
      title: bug.title,
      description: bug.description,
      createdAt: bug.createdAt,
      reporterName: bug.reporter.name,
    },
    bug.revisions,
  );
  const newestFirst = [...versions].reverse();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={issuePath(bug.number)} className="text-sm text-teal-700 hover:underline">
          ← Back to issue
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-slate-900 break-words">
          Edit history{" "}
          <span className="font-normal text-slate-500">
            · {formatIssueNumber(bug.number)} {bug.title}
          </span>
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {versions.length === 1
            ? "This issue has not been edited."
            : `${versions.length} versions of the title and description, newest first.`}
        </p>
      </div>

      <ol className="space-y-4">
        {newestFirst.map((version) => {
          const previous = versions[version.number - 2];
          const titleChanged = previous && previous.title !== version.title;
          const title = titleChanged ? wordDiff(previous.title, version.title) : null;
          return (
            <li
              key={version.number}
              className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"
              aria-labelledby={`version-${version.number}`}
            >
              <h2 id={`version-${version.number}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold text-slate-900">
                  {version.number === 1 ? "Original report" : `Version ${version.number}`}
                </span>
                {version.isCurrent ? (
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
                    Current
                  </span>
                ) : null}
                <span className="text-slate-600">
                  {version.number === 1 ? "by" : "edited by"} {version.author}
                </span>
                <LocalTime className="text-xs text-slate-500" date={version.at} />
              </h2>

              {previous ? (
                <div className="mt-4 space-y-3">
                  {title ? (
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">Title: </span>
                      <del className="rounded-sm bg-red-50 px-1 text-red-900">
                        {title.removed.map((s, i) =>
                          s.changed ? (
                            <span key={i} className="bg-red-200/80">
                              {s.text}
                            </span>
                          ) : (
                            <span key={i}>{s.text}</span>
                          ),
                        )}
                      </del>
                      <span aria-hidden> → </span>
                      <span className="sr-only"> changed to </span>
                      <ins className="rounded-sm bg-emerald-50 px-1 text-emerald-900 no-underline">
                        {title.added.map((s, i) =>
                          s.changed ? (
                            <span key={i} className="bg-emerald-200/80">
                              {s.text}
                            </span>
                          ) : (
                            <span key={i}>{s.text}</span>
                          ),
                        )}
                      </ins>
                    </p>
                  ) : null}
                  <TextDiffView before={previous.description} after={version.description} />
                </div>
              ) : null}

              <details className="group mt-4" open={!previous}>
                <summary className="cursor-pointer text-xs font-medium text-teal-700 hover:underline">
                  {previous ? "Show this version as it read" : "As reported"}
                </summary>
                <div className="mt-2 rounded-lg border border-slate-100 p-3">
                  {previous ? <p className="font-semibold text-slate-900">{version.title}</p> : null}
                  <RichText content={version.description} />
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
