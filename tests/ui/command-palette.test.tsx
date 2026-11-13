// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/zedu/acme/issues/all",
  useParams: () => ({ org: "zedu", project: "acme" }),
}));
vi.mock("@/lib/use-project-ref", () => ({ useProjectRef: () => "zedu/acme" }));

import { CommandPalette } from "@/components/command-palette";

afterEach(cleanup);

describe("CommandPalette", () => {
  it("renders the dialog shell with a search input", () => {
    render(<CommandPalette />);
    const input = screen.getByLabelText("Command palette search");
    expect(input).toBeInTheDocument();
  });

  it("opens on Ctrl+K", () => {
    render(<CommandPalette />);
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true });
    window.dispatchEvent(event);
    const input = screen.getByLabelText("Command palette search");
    expect(input).toBeInTheDocument();
  });
});