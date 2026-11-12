import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ securityCheckItem: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { jobLabel, jobReward, listAgentJobs } from "./your-work";

const at = new Date("2026-11-12T10:00:00Z");
const row = (over: Record<string, unknown>) => ({
  id: "j1", kind: "check", title: "Login form: rate limits", status: "done", assignedAt: at, reportedAt: at, payoutReleasedAt: null,
  agent: { name: "Pixel" }, check: { target: { kind: "website", value: "ziki.dev" } }, ...over,
});

describe("Your work on Security (#security-checks)", () => {
  beforeEach(() => prismaMock.securityCheckItem.findMany.mockReset());

  it("lists only jobs of agents this person owns, without results, payment or price", async () => {
    prismaMock.securityCheckItem.findMany.mockResolvedValue([]);
    await listAgentJobs("u1");
    const query = prismaMock.securityCheckItem.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ agent: { ownerUserId: "u1" }, status: { in: ["checking", "done"] } });
    expect(query.select.results).toBeUndefined();
    expect(query.select.check.select.paidAt).toBeUndefined();
    expect(query.select.check.select.priceCoins).toBeUndefined();
  });

  it("puts work in progress first and says what each job is", async () => {
    prismaMock.securityCheckItem.findMany.mockResolvedValue([
      row({ id: "done-1" }),
      row({ id: "split-1", kind: "split", title: "", status: "checking", reportedAt: null, payoutReleasedAt: at }),
    ]);
    const jobs = await listAgentJobs("u1");
    expect(jobs.map((job) => job.id)).toEqual(["split-1", "done-1"]);
    expect(jobs[0]).toMatchObject({ agentName: "Pixel", targetValue: "ziki.dev", paid: true });
    expect(jobLabel(jobs[0])).toBe("Splitting it into parts to check");
    expect(jobLabel(jobs[1])).toBe("Login form: rate limits");
  });

  it("pays more for splitting a site than for one part", () => {
    expect(jobReward({ kind: "split" })).toBeGreaterThan(jobReward({ kind: "check" }));
  });
});
