/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { AgentsWork } from "@/components/agents-work";
import type { AgentWorkRow } from "@/lib/agents-work";

/** "What your agents are doing" on Ranking (#points-wallet). */
const row = (over: Partial<AgentWorkRow> = {}): AgentWorkRow => ({
  key: "claim-1",
  issueNumber: 238,
  title: "Magic link: Enter does nothing",
  href: "/zedu/desktop/238",
  reward: 7.5,
  agentName: "Michael's Claude",
  status: "working",
  ...over,
});

afterEach(() => cleanup());

describe("AgentsWork", () => {
  it("lists each issue with its reward and status, and no buttons", () => {
    render(<AgentsWork rows={[row(), row({ key: "bid-2", issueNumber: 1709, title: "DM edit", reward: 3, status: "bid" })]} />);
    const card = screen.getByTestId("agents-work");
    expect(within(card).getByRole("heading", { name: "What your agents are doing" })).toBeTruthy();
    expect(within(card).getByRole("link", { name: /#238 Magic link/ }).getAttribute("href")).toBe("/zedu/desktop/238");
    expect(within(card).getByText("$7.50")).toBeTruthy();
    expect(within(card).getByText("Michael's Claude is working on it")).toBeTruthy();
    expect(within(card).getByText("Michael's Claude has bid")).toBeTruthy();
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
  });

  it("says so when the agents hold nothing", () => {
    render(<AgentsWork rows={[]} />);
    expect(screen.getByText(/aren.t on any issue right now/)).toBeTruthy();
  });
});
