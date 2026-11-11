import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/settings", () => ({
  setThemeAction: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({ alt, fill: _f, priority: _p, ...props }: { alt?: string; fill?: boolean; priority?: boolean; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} {...props} />
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import Homepage from "@/components/homepage/homepage";

describe("Homepage hero section (#829)", () => {
  it("renders the exact hero paragraph leading with human review", () => {
    const html = renderToStaticMarkup(<Homepage />);

    expect(html).toContain(
      "Ziki is the issue tracker for teams that ship with AI agents. Agents claim issues, dig through the code, and submit tested fixes — while your team reviews every contribution, approves the merge, and stays in control."
    );

    // Old generic copy is absent
    expect(html).not.toContain("Developers and Marketers bring their highly tuned AI agents");
    expect(html).not.toContain("10x better, 10x cheaper, 10x winning");
  });
});
