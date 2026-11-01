import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { agentIssueRequest, issueJson } from "@/lib/agent-api/issues";
import { linkPullRequest } from "@/lib/github/link-pr";
import { parseIssueRef } from "@/lib/issue-ref";
import {
  clientForInstallation,
  mergeAcceptedFix,
  parseGitHubRepoUrl,
  parsePullRequestUrl,
  sameRepo,
  standingAcceptance,
} from "@/lib/github/merge-pr";
import { getProjectRepositories, clientForRepository, findMatchingRepository } from "@/lib/github/project-repos";

export const runtime = "nodejs";

const bodySchema = z
  .object({ pullRequestUrl: z.string().trim().min(1).max(2048) })
  .strict();

/**
 * POST /api/v1/issues/{id}/github — link the pull request that fixes this
 * issue (#452). The calling agent must hold the active claim. A contributor
 * or above may attach the URL, which is audited.
 *
 * When the fix has already been accepted (#434), the same call tries to merge
 * the pull request through the project's GitHub App installation; the merge is
 * gated on acceptance, an in-repo PR, green checks, and permission. Attaching
 * before acceptance links only — no merge is attempted.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "github.linked", "contributor", id, async (agent) => {
    const parsed = bodySchema.safeParse(await issueJson(request));
    if (!parsed.success) {
      return NextResponse.json({ error: "Send a pull request URL." }, { status: 400 });
    }

    const ref = parsePullRequestUrl(parsed.data.pullRequestUrl);
    if (!ref) {
      return NextResponse.json({ error: "That is not a GitHub pull request URL." }, { status: 400 });
    }

    const issueRef = parseIssueRef(id);
    const bug = await prisma.bug.findFirst({
      where: {
        ...(issueRef.kind === "number" ? { number: issueRef.number } : { id: issueRef.id }),
        tenantId: agent.tenantId,
        isDeleted: false,
      },
      select: {
        id: true,
        projectId: true,
        pullRequestUrl: true,
        project: { select: { repoUrl: true, githubInstallationId: true } },
      },
    });
    if (!bug) return NextResponse.json({ error: "No such issue." }, { status: 404 });

    const claim = await prisma.issueClaim.findFirst({
      where: { bugId: bug.id, agentId: agent.agentId, status: "active", releasedAt: null },
      select: { id: true },
    });
    if (!claim) {
      // #539: the claim holder is normally the one to link, but a reviewer who
      // accepted this issue's review offer may attach the pull request when
      // none is linked yet — otherwise a missing solver leaves reviewed work
      // stranded with no way to connect it.
      const reviewOffer = await prisma.reviewOffer.findFirst({
        where: { bugId: bug.id, agentId: agent.agentId, status: "accepted" },
        select: { id: true },
      });
      if (!reviewOffer || bug.pullRequestUrl) {
        return NextResponse.json(
          { error: "Accept an offer or have your bid awarded before linking a fix." },
          { status: 409 },
        );
      }
    }

    // #675: check the pull request against all project repositories,
    // not just the main repoUrl. If no repositories are configured at all,
    // linking is allowed (backward compatible with projects that never set
    // a repoUrl).
    const repos = await getProjectRepositories(bug.projectId, bug.project);
    let match: { repoUrl: string; githubInstallationId: string | null } | null = null;
    if (repos.length > 0) {
      match = findMatchingRepository(ref, repos);
      if (!match) {
        return NextResponse.json(
          { error: "That pull request is not in this project's repository." },
          { status: 422 },
        );
      }
    }

    // #665: a project without a repoUrl cannot verify merges. Linking still
    // succeeds so the PR is recorded, but downstream resolve and auto-merge
    // cannot run. Tell the caller explicitly so work is not delivered into a
    // dead end.
    const canVerifyMerge = repos.length > 0;

    // #489: once a fix is accepted (#434), its pull request is part of what was
    // reviewed. Swapping in a different one would merge code nobody accepted,
    // so the link itself is refused.
    const accepted = await standingAcceptance(prisma, bug.id);
    if (accepted && bug.pullRequestUrl && bug.pullRequestUrl !== parsed.data.pullRequestUrl) {
      return NextResponse.json(
        {
          error:
            "This issue's accepted fix is bound to a different pull request — link the accepted one again.",
        },
        { status: 409 },
      );
    }

    // #489: record the head commit with the link, so the acceptance and the
    // merge gate bind to the exact code, not just a pull request number.
    let pullRequestHeadSha: string | null = null;
    const client = clientForRepository(match, bug.project?.githubInstallationId);
    if (client) {
      pullRequestHeadSha = await client
        .getPullRequest(ref)
        .then((pullRequest) => pullRequest.headSha || null)
        .catch(() => null);
    }

    await linkPullRequest({
      bugId: bug.id,
      tenantId: agent.tenantId,
      projectId: bug.projectId,
      pullRequestUrl: parsed.data.pullRequestUrl,
      pullRequestHeadSha,
      actorAgentId: agent.agentId,
      actorUserId: agent.ownerId,
    });

    const result = await mergeAcceptedFix(agent, bug.id);
    if (result.status === 200) {
      return NextResponse.json({ linked: true, merged: true, mergeCommitSha: result.mergeCommitSha, canVerifyMerge });
    }
    // The link is saved; the merge is simply not due yet.
    if (result.reason === "not_accepted") {
      return NextResponse.json({ linked: true, merged: false, reason: result.reason, canVerifyMerge });
    }
    if (result.reason === "waiting_for_human") {
      return NextResponse.json(
        { error: "waiting_for_human", approvalId: result.approvalId, linked: true, merged: false, canVerifyMerge },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { linked: true, merged: false, reason: result.reason, message: result.message, canVerifyMerge },
      { status: result.status },
    );
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
const apiOptions = createOptions(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
