import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { JudgeWorkbench } from "@/components/judging/judge-workbench";
import { requireUser } from "@/lib/auth-helpers";
import { issuePath } from "@/lib/issue-ref";
import { loadJudgingForUser } from "@/lib/judging/session";
import { findProjectIssue, parseIssueNumber } from "@/lib/project-issue";

export const metadata: Metadata = { title: "Judge delivery" };

export default async function JudgePage({
  params,
}: {
  params: Promise<{ org: string; project: string; number: string }>;
}) {
  await requireUser();
  const { org, project, number: rawNumber } = await params;
  const number = parseIssueNumber(rawNumber);
  if (number === null) notFound();

  const lookup = await findProjectIssue(org, project, number);
  if (!lookup || lookup.kind === "elsewhere") notFound();
  if (lookup.kind === "moved") {
    redirect(issuePath(lookup.issue.ref, lookup.issue.number, "/judge"));
  }
  if (lookup.issue.isDeleted) notFound();

  const initialResult = await loadJudgingForUser(lookup.issue.id);
  return <JudgeWorkbench issueId={lookup.issue.id} initialResult={initialResult} />;
}
