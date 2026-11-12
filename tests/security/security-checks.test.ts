import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  CHECK_STATUS_LABEL,
  ITEM_STATUS_LABEL,
  SECURITY_CHECK_ITEM_KINDS,
  SECURITY_CHECK_ITEM_STATUSES,
  SECURITY_CHECK_PRICE_COINS,
  SECURITY_CHECK_STATUSES,
  SECURITY_TARGET_KINDS,
  TARGET_KIND_LABEL,
  agentsMayWork,
  isCheckPaid,
  isReportPosted,
  isSecurityCheckItemStatus,
  isSecurityCheckStatus,
  isSecurityTargetKind,
} from "@/lib/security-checks";

const enumValues = (name: string) =>
  Prisma.dmmf.datamodel.enums.find((e) => e.name === name)?.values.map((v) => v.name) ?? [];

describe("security check words (#security-checks)", () => {
  it("match the database enums exactly", () => {
    expect([...SECURITY_TARGET_KINDS].sort()).toEqual(enumValues("SecurityTargetKind").sort());
    expect([...SECURITY_CHECK_STATUSES].sort()).toEqual(enumValues("SecurityCheckStatus").sort());
    expect([...SECURITY_CHECK_ITEM_KINDS].sort()).toEqual(enumValues("SecurityCheckItemKind").sort());
    expect([...SECURITY_CHECK_ITEM_STATUSES].sort()).toEqual(enumValues("SecurityCheckItemStatus").sort());
  });

  it("label every value", () => {
    for (const kind of SECURITY_TARGET_KINDS) expect(TARGET_KIND_LABEL[kind]).toBeTruthy();
    for (const status of SECURITY_CHECK_STATUSES) expect(CHECK_STATUS_LABEL[status]).toBeTruthy();
    for (const status of SECURITY_CHECK_ITEM_STATUSES) expect(ITEM_STATUS_LABEL[status]).toBeTruthy();
  });

  it("guard unknown values", () => {
    expect(isSecurityTargetKind("repo")).toBe(true);
    expect(isSecurityTargetKind("domain")).toBe(false);
    expect(isSecurityCheckStatus("checking")).toBe(true);
    expect(isSecurityCheckStatus(1)).toBe(false);
    expect(isSecurityCheckItemStatus("done")).toBe(true);
    expect(isSecurityCheckItemStatus("finished")).toBe(false);
  });

  it("keep agents off a target until ownership is proven", () => {
    const verified = { verifiedAt: new Date() };
    expect(agentsMayWork({ status: "queued" }, { verifiedAt: null })).toBe(false);
    expect(agentsMayWork({ status: "awaiting_ownership" }, verified)).toBe(false);
    expect(agentsMayWork({ status: "queued" }, verified)).toBe(true);
    expect(agentsMayWork({ status: "checking" }, verified)).toBe(true);
    expect(agentsMayWork({ status: "done" }, verified)).toBe(false);
    expect(agentsMayWork({ status: "cancelled" }, verified)).toBe(false);
  });

  it("show results only once the collated report is posted", () => {
    expect(isReportPosted({ postedAt: null })).toBe(false);
    expect(isReportPosted({ postedAt: new Date() })).toBe(true);
  });

  it("unlock the report only once paid", () => {
    expect(isCheckPaid({ paidAt: null })).toBe(false);
    expect(isCheckPaid({ paidAt: new Date() })).toBe(true);
    expect(SECURITY_CHECK_PRICE_COINS).toBe(50);
  });
});
