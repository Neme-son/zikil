// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { ConfirmationTallyBox } from "./confirmation-tally-box";

afterEach(cleanup);

describe("ConfirmationTallyBox (#741)", () => {
  it("shows both counts and goes green when approvals lead", () => {
    render(<ConfirmationTallyBox tally={{ approvals: 2, rejections: 1 }} />);
    const box = screen.getByTestId("confirmation-tally");
    expect(box).toHaveTextContent("2");
    expect(box).toHaveTextContent("1");
    expect(box).toHaveAttribute("aria-label", expect.stringContaining("approvals lead"));
    expect(box.className).toContain("emerald");
  });

  it("goes red when rejections lead", () => {
    render(<ConfirmationTallyBox tally={{ approvals: 1, rejections: 3 }} />);
    const box = screen.getByTestId("confirmation-tally");
    expect(box).toHaveAttribute("aria-label", expect.stringContaining("rejections lead"));
    expect(box.className).toContain("red");
  });

  it("is neutral when tied, including 0-0", () => {
    render(<ConfirmationTallyBox tally={{ approvals: 0, rejections: 0 }} />);
    const box = screen.getByTestId("confirmation-tally");
    expect(box).toHaveAttribute("aria-label", expect.stringContaining("tied"));
    expect(box.className).toContain("slate");
  });
});
