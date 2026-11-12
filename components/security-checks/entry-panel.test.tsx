import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/security-checks", () => ({ addSecurityTarget: vi.fn(), paySecurityCheck: vi.fn() }));
vi.mock("@/app/actions/security-assistant", () => ({ talkToSecurityAssistant: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
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
  it("shows a new workspace one box asking what to secure, the three steps, and that the first scan is free", () => {
    const html = renderToStaticMarkup(<SecurityChecksPanel checks={[]} />);
    expect(html).toContain("What do you want to secure?");
    expect(html).toContain("Your first scan is free");
    expect(html).toContain("See what&#x27;s wrong");
    expect(html).toContain('name="target"');
    expect(html).not.toContain("Your sites");
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
    expect(html).toContain("Your sites");
    expect(html).not.toContain("Find the holes");
    expect(html).toContain('href="/security/targets/t1/verify"');
    expect(html).toContain('href="/security/checks/c1/pay"');
    expect(html).toContain('href="/security/checks/c2"');
    expect(html).not.toContain('href="/security/checks/c2/pay"');
    expect(html).toContain("Show it&#x27;s yours");
    expect(html).toContain(">Continue</a>");
    expect(html).toContain("Fixes unlocked");
    expect(html).toContain("Fix · ");
    expect(html).toContain("· free");
    expect(html).toContain('aria-current="step"');
  });

  it("confirms a payment on the paid check", () => {
    const html = renderToStaticMarkup(<SecurityChecksPanel checks={[row({ paid: true })]} highlight={{ checkId: "c1", paid: true }} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Fixes unlocked. You&#x27;ll see every problem in full");
  });

  it("shows ziki.dev as the box's placeholder", () => {
    const html = renderToStaticMarkup(<SecurityEntryBox />);
    expect(html).toContain('placeholder="ziki.dev"');
  });

  it("says a new check was saved, and keeps Continue on its row", () => {
    const html = renderToStaticMarkup(<SecurityChecksPanel checks={[row({})]} highlight={{ checkId: "c1", paid: false, added: true }} />);
    expect(html).toContain("Saved. Show it&#x27;s yours and your free scan starts.");
    expect(html).toContain('href="/security/targets/t1/verify"');
  });
});
