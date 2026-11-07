import { describe, it, expect } from "vitest";
import {
  canViewSecurityFinding,
  sanitizeSecurityFinding,
  shouldDiscloseFinding,
  calculateSecurityPosture,
  REDACTED_SECURITY_DESCRIPTION,
  SECURITY_SEVERITY_MAP,
  type SecurityFinding,
} from "./security-findings";

describe("Security Findings Access Control & Disclosure (Issue #2828)", () => {
  const mockFinding: SecurityFinding = {
    id: "finding_123",
    number: 2828,
    title: "SQL Injection in Member Directory Search Endpoint",
    description: "Sending `' OR 1=1; --` in `query` parameter dumps all organisation records.",
    severity: "critical",
    status: "open",
    reporterId: "user_alice",
    createdAt: "2026-11-01T10:00:00.000Z",
    isPrivate: true,
  };

  describe("canViewSecurityFinding", () => {
    it("allows the original reporter to view the full finding", () => {
      const allowed = canViewSecurityFinding({
        isPrivate: true,
        userId: "user_alice",
        role: "user",
        membershipRole: "member",
        reporterId: "user_alice",
      });
      expect(allowed).toBe(true);
    });

    it("allows workspace admins and super admins to view the full finding", () => {
      expect(
        canViewSecurityFinding({
          isPrivate: true,
          userId: "user_admin",
          role: "admin",
          reporterId: "user_alice",
        }),
      ).toBe(true);

      expect(
        canViewSecurityFinding({
          isPrivate: true,
          userId: "user_super",
          role: "super_admin",
          reporterId: "user_alice",
        }),
      ).toBe(true);
    });

    it("allows tenant owners and tenant admins to view the full finding", () => {
      expect(
        canViewSecurityFinding({
          isPrivate: true,
          userId: "user_tenant_owner",
          role: "user",
          membershipRole: "owner",
          reporterId: "user_alice",
        }),
      ).toBe(true);

      expect(
        canViewSecurityFinding({
          isPrivate: true,
          userId: "user_tenant_admin",
          role: "user",
          membershipRole: "admin",
          reporterId: "user_alice",
        }),
      ).toBe(true);
    });

    it("allows security-cleared agents to view the full finding", () => {
      expect(
        canViewSecurityFinding({
          isPrivate: true,
          userId: null,
          reporterId: "user_alice",
          isSecurityCleared: true,
        }),
      ).toBe(true);
    });

    it("blocks other regular users and non-cleared agents from viewing private findings", () => {
      const blocked = canViewSecurityFinding({
        isPrivate: true,
        userId: "user_bob_stranger",
        role: "user",
        membershipRole: "member",
        reporterId: "user_alice",
        isSecurityCleared: false,
      });
      expect(blocked).toBe(false);
    });

    it("allows anyone to view disclosed findings", () => {
      const allowed = canViewSecurityFinding({
        isPrivate: false,
        userId: "random_guest",
        role: "user",
        reporterId: "user_alice",
      });
      expect(allowed).toBe(true);
    });
  });

  describe("sanitizeSecurityFinding", () => {
    it("redacts title and payload description for unauthorized users", () => {
      const sanitized = sanitizeSecurityFinding(mockFinding, false);
      expect(sanitized.title).toBe("[Confidential Security Advisory] (CRITICAL Severity)");
      expect(sanitized.description).toBe(REDACTED_SECURITY_DESCRIPTION);
      expect(sanitized.description).not.toContain("SQL Injection");
    });

    it("preserves full exploit steps and title for authorized users", () => {
      const preserved = sanitizeSecurityFinding(mockFinding, true);
      expect(preserved.title).toBe(mockFinding.title);
      expect(preserved.description).toBe(mockFinding.description);
    });

    it("preserves full title and description if the finding is already disclosed/public", () => {
      const publicFinding = { ...mockFinding, isPrivate: false };
      const result = sanitizeSecurityFinding(publicFinding, false);
      expect(result.title).toBe(mockFinding.title);
      expect(result.description).toBe(mockFinding.description);
    });
  });

  describe("shouldDiscloseFinding", () => {
    it("returns true for live and closed statuses", () => {
      expect(shouldDiscloseFinding("closed")).toBe(true);
      expect(shouldDiscloseFinding("live")).toBe(true);
      expect(shouldDiscloseFinding("open", "live")).toBe(true);
      expect(shouldDiscloseFinding("open", "resolved")).toBe(true);
    });

    it("returns false for active in-progress issues", () => {
      expect(shouldDiscloseFinding("open", "in_progress")).toBe(false);
      expect(shouldDiscloseFinding("in_progress")).toBe(false);
    });
  });

  describe("calculateSecurityPosture", () => {
    it("computes accurate security posture metrics", () => {
      const sampleFindings = [
        {
          severity: "critical" as const,
          status: "open" as const,
          createdAt: "2026-11-01T00:00:00Z",
        },
        {
          severity: "high" as const,
          status: "remediating" as const,
          createdAt: "2026-11-02T00:00:00Z",
        },
        {
          severity: "high" as const,
          status: "disclosed" as const,
          createdAt: "2026-11-01T00:00:00Z",
          disclosedAt: "2026-11-03T00:00:00Z", // 2 days = 48h (SLA is 168h -> SLA Met)
        },
        {
          severity: "medium" as const,
          status: "disclosed" as const,
          createdAt: "2026-10-20T00:00:00Z",
          disclosedAt: "2026-10-24T00:00:00Z", // 4 days (SLA is 720h -> SLA Met)
        },
      ];

      const metrics = calculateSecurityPosture(sampleFindings);
      expect(metrics.totalFindings).toBe(4);
      expect(metrics.openCriticalHigh).toBe(2);
      expect(metrics.remediationRatePercent).toBe(50);
      expect(metrics.slaCompliancePercent).toBe(100);
      expect(metrics.medianTimeToRemediateDays).toBeGreaterThan(0);
    });

    it("returns healthy baseline metrics when finding list is empty", () => {
      const metrics = calculateSecurityPosture([]);
      expect(metrics.totalFindings).toBe(0);
      expect(metrics.openCriticalHigh).toBe(0);
      expect(metrics.remediationRatePercent).toBe(100);
      expect(metrics.slaCompliancePercent).toBe(100);
    });
  });

  describe("Severity SLA Mapping", () => {
    it("defines clear SLA limits for all 4 severities", () => {
      expect(SECURITY_SEVERITY_MAP.critical.slaHours).toBe(24);
      expect(SECURITY_SEVERITY_MAP.high.slaHours).toBe(168);
      expect(SECURITY_SEVERITY_MAP.medium.slaHours).toBe(720);
      expect(SECURITY_SEVERITY_MAP.low.slaHours).toBe(2160);
    });
  });
});
