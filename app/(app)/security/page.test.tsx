import { describe, it, expect, vi } from "vitest";
import React from "react";
import SecurityPage from "./page";

// Mock dependencies
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bug: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "bug_mock_1",
          number: 2828,
          title: "Private security findings with severity, restricted visibility and disclosure after fix",
          description: "Confidential security vulnerability details.",
          severity: "high",
          status: "open",
          substatus: "open",
          reporterId: "user_alice",
          assigneeId: null,
          createdAt: new Date("2026-11-01"),
          updatedAt: new Date("2026-11-02"),
          reporter: { id: "user_alice", name: "Alice Security" },
          proofLinks: [],
        },
      ]),
    },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: "user_admin_1",
    role: "admin",
  }),
}));

vi.mock("@/lib/tenant-access", () => ({
  currentTenantAccess: vi.fn().mockResolvedValue({
    admin: true,
    membershipRole: "admin",
  }),
}));

describe("Security Operations Center (/security)", () => {
  it("renders the security center dashboard with posture metrics", async () => {
    const pageComponent = await SecurityPage({
      searchParams: Promise.resolve({ tab: "active" }),
    });

    expect(pageComponent).toBeDefined();
    expect(React.isValidElement(pageComponent)).toBe(true);
  });

  it("renders disclosed advisories tab cleanly", async () => {
    const pageComponent = await SecurityPage({
      searchParams: Promise.resolve({ tab: "disclosed" }),
    });

    expect(pageComponent).toBeDefined();
    expect(React.isValidElement(pageComponent)).toBe(true);
  });

  it("renders responsible disclosure policy and SLA tab cleanly", async () => {
    const pageComponent = await SecurityPage({
      searchParams: Promise.resolve({ tab: "policy" }),
    });

    expect(pageComponent).toBeDefined();
    expect(React.isValidElement(pageComponent)).toBe(true);
  });
});
