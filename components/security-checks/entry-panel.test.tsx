import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/security-checks", () => ({ addSecurityTarget: vi.fn(), paySecurityCheck: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/components/local-time", () => ({ LocalTime: () => <time>2 days ago</time> }));

import { SecurityChecksPanel } from "./entry-panel";
import { SecurityEntryBox } from "./entry-box";
import type { WorkspaceCheckRow } from "@/lib/security-checks/entry";

const row = (over: Partial<WorkspaceCheckRow>): WorkspaceCheckRow => ({
  id: "c1", targetId: "t1", kind: "website", value: "settle.ng", status: "awaiting_ownership",
  verified: false, paid: false, priceCoins: 50, createdAt: new Date("2026-11-11T10:00:00Z"), ...over,
});

describe("SecurityChecksPanel (#security-checks part 1)", () => {
  it("shows a new workspace a short empty state with Check a site, and keeps the box closed", () => {
    const html = renderToStaticMarkup(<SecurityChecksPanel checks={[]} />);
    expect(html).toContain("Find the holes before someone else does");
    expect(html).toContain("Check a site");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('name="target"');
    expect(html).toContain("Agents only look.");
    expect(html).not.toContain("Your checks");
  });

  it("shows a returning workspace its checks, without the empty state", () => {
    const html = renderToStaticMarkup(
      <SecurityChecksPanel
        checks={[
          row({}),
          row({ id: "c2", targetId: "t2", kind: "repo", value: "settle/app", status: "checking", verified: true, paid: true }),
        ]}
      />,
    );
    expect(html).toContain("Your checks");
    expect(html).not.toContain("Find the holes");
    expect(html).toContain('href="/security/targets/t1/verify"');
    expect(html).toContain('href="/security/checks/c1/pay"');
    expect(html).toContain('href="/security/checks/c2"');
    expect(html).not.toContain('href="/security/checks/c2/pay"');
    expect(html).toContain("Show it&#x27;s yours");
    expect(html).toContain(">Continue</a>");
    expect(html).toContain("Paid");
    expect(html).toContain('aria-current="step"');
  });

  it("confirms a payment on the paid check", () => {
    const html = renderToStaticMarkup(<SecurityChecksPanel checks={[row({ paid: true })]} highlight={{ checkId: "c1", paid: true }} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("full report");
  });

  it("shows ziki.dev as the box's placeholder", () => {
    const html = renderToStaticMarkup(<SecurityEntryBox />);
    expect(html).toContain('placeholder="ziki.dev"');
  });

  it("says a new check was saved, and keeps Continue on its row", () => {
    const html = renderToStaticMarkup(<SecurityChecksPanel checks={[row({})]} highlight={{ checkId: "c1", paid: false, added: true }} />);
    expect(html).toContain("Saved. Next, you show it&#x27;s yours");
    expect(html).toContain('href="/security/targets/t1/verify"');
  });
});
