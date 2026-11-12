import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const prismaMock = vi.hoisted(() => ({
  securityTarget: { findUnique: vi.fn(), create: vi.fn() },
  securityCheck: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { addTargetAndCheck, listWorkspaceChecks, newOwnershipToken, nextStepPath } from "./entry";
import { canPayForCheck, payForCheck } from "./payment";

const site = { kind: "website" as const, value: "settle.ng", input: "https://settle.ng" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addTargetAndCheck (#security-checks part 1)", () => {
  it("stores a new target with a fresh token and opens a check waiting for ownership", async () => {
    prismaMock.securityTarget.findUnique.mockResolvedValue(null);
    prismaMock.securityTarget.create.mockResolvedValue({ id: "t1", verifiedAt: null });
    prismaMock.securityCheck.findFirst.mockResolvedValue(null);
    prismaMock.securityCheck.create.mockResolvedValue({ id: "c1" });

    const added = await addTargetAndCheck("org1", "u1", site);

    expect(added).toEqual({ targetId: "t1", checkId: "c1", verified: false, reused: false });
    const created = prismaMock.securityTarget.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ organisationId: "org1", kind: "website", value: "settle.ng", input: "https://settle.ng", addedById: "u1" });
    expect(created.ownershipToken).toMatch(/^ziki-verify-[0-9a-f]{32}$/);
    expect(prismaMock.securityCheck.create.mock.calls[0][0].data).toEqual({
      organisationId: "org1", targetId: "t1", requestedById: "u1", priceCoins: 50, status: "awaiting_ownership",
    });
  });

  it("reuses the workspace's target, and a proven target skips straight to queued", async () => {
    prismaMock.securityTarget.findUnique.mockResolvedValue({ id: "t1", verifiedAt: new Date() });
    prismaMock.securityCheck.findFirst.mockResolvedValue(null);
    prismaMock.securityCheck.create.mockResolvedValue({ id: "c2" });

    const added = await addTargetAndCheck("org1", "u1", site);

    expect(prismaMock.securityTarget.create).not.toHaveBeenCalled();
    expect(prismaMock.securityCheck.create.mock.calls[0][0].data.status).toBe("queued");
    expect(added).toMatchObject({ checkId: "c2", verified: true, reused: false });
  });

  it("reuses the person's own unfinished check instead of opening a second one", async () => {
    prismaMock.securityTarget.findUnique.mockResolvedValue({ id: "t1", verifiedAt: null });
    prismaMock.securityCheck.findFirst.mockResolvedValue({ id: "c-open" });

    const added = await addTargetAndCheck("org1", "u1", site);

    expect(added).toEqual({ targetId: "t1", checkId: "c-open", verified: false, reused: true });
    expect(prismaMock.securityCheck.create).not.toHaveBeenCalled();
    expect(prismaMock.securityCheck.findFirst.mock.calls[0][0].where).toMatchObject({
      targetId: "t1", organisationId: "org1", requestedById: "u1", status: { notIn: expect.arrayContaining(["done", "cancelled"]) },
    });
  });

  it("uses the winner when two people add the same target at once", async () => {
    prismaMock.securityTarget.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "t-won", verifiedAt: null });
    prismaMock.securityTarget.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }),
    );
    prismaMock.securityCheck.findFirst.mockResolvedValue(null);
    prismaMock.securityCheck.create.mockResolvedValue({ id: "c3" });

    const added = await addTargetAndCheck("org1", "u1", site);
    expect(added.targetId).toBe("t-won");
  });

  it("makes a different token every time", () => {
    expect(newOwnershipToken()).not.toBe(newOwnershipToken());
  });
});

describe("nextStepPath", () => {
  it("sends an unproven target to prove ownership, a proven one to pay", () => {
    expect(nextStepPath({ targetId: "t1", checkId: "c1", verified: false })).toBe("/security/targets/t1/verify");
    expect(nextStepPath({ targetId: "t1", checkId: "c1", verified: true })).toBe("/security/checks/c1/pay");
  });
});

describe("listWorkspaceChecks", () => {
  it("lists only the checks this person asked for in this workspace, newest first, without results", async () => {
    const createdAt = new Date("2026-11-11T10:00:00Z");
    prismaMock.securityCheck.findMany.mockResolvedValue([
      { id: "c1", status: "awaiting_ownership", paidAt: null, priceCoins: 50, createdAt, target: { id: "t1", kind: "website", value: "settle.ng", verifiedAt: null } },
      { id: "c2", status: "checking", paidAt: createdAt, priceCoins: 50, createdAt, target: { id: "t2", kind: "repo", value: "settle/app", verifiedAt: createdAt } },
    ]);

    const rows = await listWorkspaceChecks("org1", "u1");

    const query = prismaMock.securityCheck.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ organisationId: "org1", requestedById: "u1" });
    expect(query.orderBy).toEqual({ createdAt: "desc" });
    expect(query.select.results).toBeUndefined();
    expect(rows.map((r) => [r.id, r.value, r.verified, r.paid])).toEqual([
      ["c1", "settle.ng", false, false],
      ["c2", "settle/app", true, true],
    ]);
  });
});

describe("payment (simulated)", () => {
  it("only sets paidAt, once, for the person's own live check", async () => {
    prismaMock.securityCheck.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date("2026-11-11T12:00:00Z");

    expect(await payForCheck("c1", "org1", "u1", now)).toBe("paid");
    expect(prismaMock.securityCheck.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", organisationId: "org1", requestedById: "u1", paidAt: null, status: { not: "cancelled" } },
      data: { paidAt: now },
    });
  });

  it("never pays twice, and says why it didn't pay", async () => {
    prismaMock.securityCheck.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.securityCheck.findFirst.mockResolvedValueOnce({ paidAt: new Date(), status: "queued" });
    expect(await payForCheck("c1", "org1", "u1")).toBe("already_paid");
    prismaMock.securityCheck.findFirst.mockResolvedValueOnce({ paidAt: null, status: "cancelled" });
    expect(await payForCheck("c1", "org1", "u1")).toBe("cancelled");
    prismaMock.securityCheck.findFirst.mockResolvedValueOnce(null);
    expect(await payForCheck("someone-elses-check", "org1", "u1")).toBe("not_found");
    expect(prismaMock.securityCheck.findFirst.mock.calls.at(-1)?.[0].where).toEqual({ id: "someone-elses-check", organisationId: "org1", requestedById: "u1" });
  });

  it("knows which checks can still be paid", () => {
    expect(canPayForCheck({ paidAt: null, status: "awaiting_ownership" })).toBe(true);
    expect(canPayForCheck({ paidAt: null, status: "done" })).toBe(true);
    expect(canPayForCheck({ paidAt: new Date(), status: "queued" })).toBe(false);
    expect(canPayForCheck({ paidAt: null, status: "cancelled" })).toBe(false);
  });
});
