import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  addTargetAndCheck: vi.fn(),
  payForCheck: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1", role: "member" }) }));
vi.mock("@/lib/organisation-access", () => ({ currentOrganisationAccess: mocks.access }));
vi.mock("@/lib/security-checks/entry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security-checks/entry")>()),
  addTargetAndCheck: mocks.addTargetAndCheck,
}));
vi.mock("@/lib/security-checks/payment", () => ({ payForCheck: mocks.payForCheck }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { addSecurityTarget, paySecurityCheck } from "./security-checks";

const form = (target: string) => {
  const data = new FormData();
  data.set("target", target);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ organisationId: "org1", admin: false });
});

describe("addSecurityTarget (#security-checks part 1)", () => {
  it("needs a workspace", async () => {
    mocks.access.mockResolvedValue({ organisationId: null, admin: false });
    expect(await addSecurityTarget({}, form("settle.ng"))).toEqual({ error: "Join or create a workspace to check a site.", input: "settle.ng" });
    expect(mocks.addTargetAndCheck).not.toHaveBeenCalled();
  });

  it("explains a target it can't read and keeps what was typed", async () => {
    const state = await addSecurityTarget({}, form("192.168.1.1"));
    expect(state.error).toMatch(/private/);
    expect(state.input).toBe("192.168.1.1");
    expect(mocks.addTargetAndCheck).not.toHaveBeenCalled();
  });

  it("stores the tidy target and goes to step 2 to prove ownership", async () => {
    mocks.addTargetAndCheck.mockResolvedValue({ targetId: "t1", checkId: "c1", verified: false, reused: false });
    await expect(addSecurityTarget({}, form("https://www.settle.ng/"))).rejects.toThrow("REDIRECT /security?check=c1&added=1");
    expect(mocks.addTargetAndCheck).toHaveBeenCalledWith("org1", "u1", { kind: "website", value: "settle.ng", input: "https://www.settle.ng/" });
  });

  it("skips to paying when the target was already proven", async () => {
    mocks.addTargetAndCheck.mockResolvedValue({ targetId: "t1", checkId: "c9", verified: true, reused: false });
    await expect(addSecurityTarget({}, form("github.com/settle/app"))).rejects.toThrow("REDIRECT /security/checks/c9/pay");
  });
});

describe("paySecurityCheck", () => {
  it("marks the check paid in this workspace, then goes back to the list", async () => {
    mocks.payForCheck.mockResolvedValue("paid");
    await expect(paySecurityCheck("c1")).rejects.toThrow("REDIRECT /security?check=c1&paid=1");
    expect(mocks.payForCheck).toHaveBeenCalledWith("c1", "org1", "u1");
  });

  it("treats paying twice as done", async () => {
    mocks.payForCheck.mockResolvedValue("already_paid");
    await expect(paySecurityCheck("c1")).rejects.toThrow("REDIRECT /security?check=c1&paid=1");
  });

  it("refuses another workspace's check and a cancelled one", async () => {
    mocks.payForCheck.mockResolvedValue("not_found");
    expect(await paySecurityCheck("c1")).toEqual({ error: "That check isn't in this workspace." });
    mocks.payForCheck.mockResolvedValue("cancelled");
    expect((await paySecurityCheck("c1")).error).toMatch(/cancelled/);
  });
});
