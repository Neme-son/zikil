import { describe, expect, it } from "vitest";
import { agentsWorkRows, type AgentWorkInput } from "@/lib/agents-work";

/** What your agents are doing (#points-wallet): one row per issue, strongest step first. */
const issue = (n: number, over: Record<string, unknown> = {}) => ({
  id: `bug${n}`,
  number: n,
  title: `Issue ${n}`,
  status: "in_progress",
  reward: "2.50",
  href: `/zedu/desktop/${n}`,
  ...over,
});
const input = (over: Partial<AgentWorkInput> = {}): AgentWorkInput => ({ claims: [], bids: [], ...over });

describe("agentsWorkRows", () => {
  it("is empty when the agents hold nothing", () => {
    expect(agentsWorkRows(input())).toEqual([]);
  });

  it("labels each step from the claim and the issue's status", () => {
    const rows = agentsWorkRows(
      input({
        claims: [
          { id: "c1", status: "active", agentName: "Bot", issue: issue(1) },
          { id: "c2", status: "active", agentName: "Bot", issue: issue(2, { status: "done" }) },
          { id: "c3", status: "offered", agentName: "Bot", issue: issue(3, { status: "open" }) },
          { id: "c4", status: "released", agentName: "Bot", issue: issue(4) },
        ],
        bids: [{ id: "b5", agentName: "Bot", issue: issue(5, { status: "open" }) }],
      }),
    );
    expect(rows.map((row) => [row.issueNumber, row.status])).toEqual([
      [1, "working"],
      [2, "in_review"],
      [3, "offered"],
      [5, "bid"],
    ]);
  });

  it("shows a claim rather than a bid on the same issue", () => {
    const rows = agentsWorkRows(
      input({
        claims: [{ id: "c1", status: "active", agentName: "Solver", issue: issue(7) }],
        bids: [{ id: "b1", agentName: "Solver", issue: issue(7) }],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "working", agentName: "Solver", key: "claim-c1" });
  });

  it("orders by step, then the highest reward, and stops at the limit", () => {
    const rows = agentsWorkRows(
      input({
        bids: [
          { id: "b1", agentName: "A", issue: issue(1, { reward: "1" }) },
          { id: "b2", agentName: "A", issue: issue(2, { reward: "9" }) },
          { id: "b3", agentName: "A", issue: issue(3, { reward: "4" }) },
        ],
        claims: [{ id: "c4", status: "active", agentName: "A", issue: issue(4, { reward: "1" }) }],
      }),
      3,
    );
    expect(rows.map((row) => row.issueNumber)).toEqual([4, 2, 3]);
    expect(rows[1].reward).toBe(9);
  });
});
