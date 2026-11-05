import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
const bugCount = vi.hoisted(() => vi.fn());
const findPlatform = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst },
    bug: { count: bugCount },
    platformRewardConfig: { findUnique: findPlatform },
  },
}));

import { AgentProjectError } from "@/lib/agents/require-agent";
import { IssueApiError } from "@/lib/agent-api/errors";
import { issueProject } from "@/lib/agent-api/issues";
import { getAgentProject } from "@/lib/agent-api/projects";

const agent = {
  agentId: "agent1",
  name: "Ada's Claude",
  ownerId: "ada",
  tenantId: "tenant_zedu",
  level: "working" as const,
  burst: false,
  keyId: "key1",
};

describe("issueProject project scope (#742)", () => {
  beforeEach(() => {
    findFirst.mockReset();
    findFirst.mockResolvedValue({ id: "project_web" });
  });

  it("allows a legacy key that is not limited to a project", async () => {
    await expect(issueProject({ ...agent, projectId: null }, new URLSearchParams("projectId=project_web"))).resolves.toEqual({
      tenantId: "tenant_zedu",
      projectId: "project_web",
    });
  });

  it("allows a key limited to that project", async () => {
    await expect(
      issueProject(
        { ...agent, projectId: "project_web", projectSlug: "web" },
        new URLSearchParams("projectId=project_web"),
      ),
    ).resolves.toMatchObject({ projectId: "project_web" });
  });

  it("rejects a key limited to another project", async () => {
    await expect(
      issueProject(
        { ...agent, projectId: "project_mobile", projectSlug: "mobile" },
        new URLSearchParams("projectId=project_web"),
      ),
    ).rejects.toBeInstanceOf(AgentProjectError);
  });
});

describe("getAgentProject (#574)", () => {
  const row = {
    id: "cmvggfa9v003yn72gfxaplftl",
    slug: "ziki",
    name: "Ziki",
    goal: "Track bugs",
    repoUrl: "https://github.com/emerjent/ziki",
    stagingUrl: "https://ziki.dev",
    rewardConfig: null,
    workflow: null,
  };

  beforeEach(() => {
    findFirst.mockReset();
    bugCount.mockReset();
    findPlatform.mockReset();
    findFirst.mockResolvedValue(row);
    bugCount.mockResolvedValue(12);
    findPlatform.mockResolvedValue(null);
  });

  it("resolves a project by slug as well as internal cuid", async () => {
    const result = await getAgentProject("tenant_zedu", "ziki");
    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant_zedu", OR: [{ id: "ziki" }, { slug: "ziki" }] },
      select: expect.objectContaining({ id: true, slug: true }),
    });
    expect(bugCount).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant_zedu",
        projectId: "cmvggfa9v003yn72gfxaplftl",
        isDeleted: false,
        substatus: "open",
      },
    });
    expect(result).toMatchObject({
      id: "cmvggfa9v003yn72gfxaplftl",
      slug: "ziki",
      notesUrl: "/api/v1/projects/cmvggfa9v003yn72gfxaplftl/notes",
      openIssueCount: 12,
    });
  });

  it("resolves a project by internal cuid", async () => {
    const result = await getAgentProject("tenant_zedu", "cmvggfa9v003yn72gfxaplftl");
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant_zedu",
        OR: [{ id: "cmvggfa9v003yn72gfxaplftl" }, { slug: "cmvggfa9v003yn72gfxaplftl" }],
      },
      select: expect.objectContaining({ id: true, slug: true }),
    });
    expect(result.id).toBe("cmvggfa9v003yn72gfxaplftl");
  });

  it("throws 404 when neither id nor slug matches in the tenant", async () => {
    findFirst.mockResolvedValue(null);
    await expect(getAgentProject("tenant_zedu", "unknown")).rejects.toEqual(
      new IssueApiError(404, "Project not found."),
    );
  });
});
