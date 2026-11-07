/**
 * Security Findings and Responsible Vulnerability Disclosure Engine.
 * Implements Ziki Issue #2828:
 * - Confidential reporting with explicit severity classification (Critical, High, Medium, Low).
 * - Restricted visibility: Details are visible only to admins, the reporter, and security-cleared agents.
 * - Automatic disclosure workflow upon verified resolution.
 */

export type SecuritySeverity = "critical" | "high" | "medium" | "low";

export type SecurityFindingStatus =
  | "open"
  | "triaged"
  | "remediating"
  | "patched"
  | "disclosed";

export interface SecurityFinding {
  id: string;
  number: number;
  title: string;
  description: string;
  severity: SecuritySeverity;
  status: SecurityFindingStatus;
  reporterId: string;
  reporterName?: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
  disclosedAt?: string | Date | null;
  cveId?: string | null;
  remediationPr?: string | null;
  isPrivate: boolean;
}

export interface SecuritySeverityMeta {
  label: string;
  cvss: string;
  badgeClass: string;
  slaHours: number;
  slaLabel: string;
  description: string;
}

export const SECURITY_SEVERITY_MAP: Record<SecuritySeverity, SecuritySeverityMeta> = {
  critical: {
    label: "Critical",
    cvss: "9.0 - 10.0",
    badgeClass: "bg-red-500/10 text-red-500 border-red-500/30",
    slaHours: 24,
    slaLabel: "24 Hours SLA",
    description: "Remote code execution, authentication bypass, arbitrary data deletion, mass secret exposure.",
  },
  high: {
    label: "High",
    cvss: "7.0 - 8.9",
    badgeClass: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    slaHours: 168,
    slaLabel: "7 Days SLA",
    description: "Insecure direct object reference (IDOR), privilege escalation, cross-tenant data leakage.",
  },
  medium: {
    label: "Medium",
    cvss: "4.0 - 6.9",
    badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    slaHours: 720,
    slaLabel: "30 Days SLA",
    description: "Cross-site request forgery, rate limit evasion, sensitive logging, non-critical business logic flaws.",
  },
  low: {
    label: "Low",
    cvss: "0.1 - 3.9",
    badgeClass: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    slaHours: 2160,
    slaLabel: "90 Days SLA",
    description: "Information disclosure, missing security hardening headers, verbose debug errors.",
  },
};

/**
 * Access-control evaluator for confidential security findings.
 * Rule:
 * 1. Disclosed/public findings can be viewed by anyone.
 * 2. Unfixed private findings can ONLY be viewed by:
 *    - Workspace admins or super-admins.
 *    - Organization owners or admins.
 *    - The reporter who submitted the finding.
 *    - Agents explicitly security-cleared.
 */
export function canViewSecurityFinding({
  isPrivate,
  userId,
  role,
  membershipRole,
  reporterId,
  isSecurityCleared = false,
}: {
  isPrivate: boolean;
  userId?: string | null;
  role?: string | null;
  membershipRole?: string | null;
  reporterId: string;
  isSecurityCleared?: boolean;
}): boolean {
  if (!isPrivate) {
    return true;
  }

  if (role === "admin" || role === "super_admin") {
    return true;
  }

  if (membershipRole === "owner" || membershipRole === "admin") {
    return true;
  }

  if (userId && userId === reporterId) {
    return true;
  }

  if (isSecurityCleared) {
    return true;
  }

  return false;
}

/** Redacted placeholder copy displayed to unauthorized community viewers */
export const REDACTED_SECURITY_DESCRIPTION =
  "🔒 **Restricted Security Advisory**\n\n" +
  "This issue contains a confidential security vulnerability reported under responsible disclosure.\n\n" +
  "Exploit reproduction steps, payloads, and sensitive attachments are strictly restricted to workspace administrators, " +
  "cleared security agents, and the original reporter until a verified patch has been deployed to production.";

/**
 * Sanitizes a security finding for public or unauthorized consumption.
 */
export function sanitizeSecurityFinding(
  finding: SecurityFinding,
  authorized: boolean,
): SecurityFinding {
  if (authorized || !finding.isPrivate) {
    return finding;
  }

  const severityUpper = finding.severity.toUpperCase();
  return {
    ...finding,
    title: `[Confidential Security Advisory] (${severityUpper} Severity)`,
    description: REDACTED_SECURITY_DESCRIPTION,
  };
}

/**
 * Evaluates whether an issue is ready for public responsible disclosure.
 */
export function shouldDiscloseFinding(status: string, substatus?: string | null): boolean {
  const normStatus = status.toLowerCase();
  const normSub = (substatus || "").toLowerCase();
  return (
    normStatus === "closed" ||
    normStatus === "live" ||
    normSub === "live" ||
    normSub === "resolved" ||
    normSub === "disclosed"
  );
}

export interface SecurityPostureMetrics {
  totalFindings: number;
  openCriticalHigh: number;
  remediationRatePercent: number;
  medianTimeToRemediateDays: number;
  slaCompliancePercent: number;
}

/**
 * Computes high-level posture metrics for the /security dashboard.
 */
export function calculateSecurityPosture(
  findings: Array<{
    severity: SecuritySeverity;
    status: SecurityFindingStatus;
    createdAt: string | Date;
    disclosedAt?: string | Date | null;
  }>,
): SecurityPostureMetrics {
  if (!findings.length) {
    return {
      totalFindings: 0,
      openCriticalHigh: 0,
      remediationRatePercent: 100,
      medianTimeToRemediateDays: 0,
      slaCompliancePercent: 100,
    };
  }

  let openCriticalHigh = 0;
  let resolvedCount = 0;
  let slaMetCount = 0;
  const resolutionTimesDays: number[] = [];

  for (const f of findings) {
    const isOpen = f.status === "open" || f.status === "triaged" || f.status === "remediating";
    if (isOpen) {
      if (f.severity === "critical" || f.severity === "high") {
        openCriticalHigh++;
      }
    } else {
      resolvedCount++;
      if (f.disclosedAt) {
        const createdMs = new Date(f.createdAt).getTime();
        const disclosedMs = new Date(f.disclosedAt).getTime();
        const diffDays = Math.max(0, (disclosedMs - createdMs) / (1000 * 60 * 60 * 24));
        resolutionTimesDays.push(diffDays);

        const diffHours = (disclosedMs - createdMs) / (1000 * 60 * 60);
        const targetSla = SECURITY_SEVERITY_MAP[f.severity].slaHours;
        if (diffHours <= targetSla) {
          slaMetCount++;
        }
      } else {
        slaMetCount++;
      }
    }
  }

  resolutionTimesDays.sort((a, b) => a - b);
  const medianTime = resolutionTimesDays.length
    ? resolutionTimesDays[Math.floor(resolutionTimesDays.length / 2)]!
    : 2.5;

  const total = findings.length;
  const remediationRate = Math.round((resolvedCount / total) * 100);
  const slaCompliance = resolvedCount ? Math.round((slaMetCount / resolvedCount) * 100) : 100;

  return {
    totalFindings: total,
    openCriticalHigh,
    remediationRatePercent: remediationRate,
    medianTimeToRemediateDays: Number(medianTime.toFixed(1)),
    slaCompliancePercent: slaCompliance,
  };
}
