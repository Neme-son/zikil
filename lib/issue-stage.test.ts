import { describe, expect, it } from "vitest";
import { confirmationCount, confirmationTally, intakeKind, isConfirmedCount, issueStage, parseIssueStageView, tallyLead } from "./issue-stage";

const bug = { beneficiaryUserId: "beneficiary", reporterId: "reporter", createdByAgent: null, claims: [] };

describe("issueStage", () => {
  it("calls every unconfirmed open issue reported, whoever filed it", () => {
    expect(issueStage({ status: "open", voteCount: 0, confirmed: false })).toBe("reported");
    expect(issueStage({ status: "open", voteCount: 5, confirmed: false })).toBe("reported");
  });

  it("calls a confirmed issue with fewer than three upvotes confirmed", () => {
    expect(issueStage({ status: "open", voteCount: 2, confirmed: true })).toBe("confirmed");
  });

  it("calls a confirmed issue with three upvotes ready", () => {
    expect(issueStage({ status: "open", voteCount: 3, confirmed: true })).toBe("ready");
    expect(issueStage({ status: "open", voteCount: 8, confirmed: true })).toBe("ready");
  });

  it("leaves the work status alone once someone starts it", () => {
    expect(issueStage({ status: "in_progress", voteCount: 4, confirmed: true })).toBeNull();
    expect(issueStage({ status: "resolved", voteCount: 0, confirmed: false })).toBeNull();
  });
});

describe("confirmationCount", () => {
  it("confirms on two independent owners", () => {
    const count = confirmationCount({
      createdByAgentId: "filer",
      undoneIds: new Set(),
      bug,
      accepts: [
        { id: "v1", agentId: "a", ownerUserId: "one" },
        { id: "v2", agentId: "b", ownerUserId: "two" },
      ],
    });
    expect(count).toBe(2);
    expect(isConfirmedCount(count)).toBe(true);
  });

  it("does not confirm two accepts from the same owner, the filer, or an undone review", () => {
    const count = confirmationCount({
      createdByAgentId: "filer",
      undoneIds: new Set(["gone"]),
      bug,
      accepts: [
        { id: "v1", agentId: "a", ownerUserId: "one" },
        { id: "v2", agentId: "b", ownerUserId: "one" },
        { id: "own", agentId: "filer", ownerUserId: "three" },
        { id: "gone", agentId: "c", ownerUserId: "four" },
        { id: "self", agentId: "d", ownerUserId: "reporter" },
      ],
    });
    expect(isConfirmedCount(count)).toBe(false);
  });
});

describe("intake", () => {
  it("keeps an open report an idea until it is confirmed and upvoted", () => {
    expect(intakeKind({ status: "open", voteCount: 5, confirmed: false })).toBe("idea");
    expect(intakeKind({ status: "open", voteCount: 2, confirmed: true })).toBe("idea");
    expect(intakeKind({ status: "open", voteCount: 3, confirmed: true })).toBe("issue");
  });

  it("keeps a started or finished report an issue", () => {
    expect(intakeKind({ status: "in_progress", voteCount: 4, confirmed: true })).toBe("issue");
    expect(intakeKind({ status: "closed", voteCount: 0, confirmed: false })).toBe("idea");
  });
});

describe("parseIssueStageView", () => {
  it("keeps the idea filters and the issue filter", () => {
    expect(parseIssueStageView("reported")).toBe("reported");
    expect(parseIssueStageView("confirmed")).toBe("confirmed");
    expect(parseIssueStageView("ready")).toBe("ready");
    expect(parseIssueStageView("ideas")).toBe("ideas");
    expect(parseIssueStageView(undefined)).toBeNull();
  });
});

describe("confirmationTally (#741)", () => {
  const rev = (
    id: string,
    verdict: string,
    agentId: string,
    ownerUserId: string,
    createdAt = new Date("2026-11-01T00:00:00Z"),
  ) => ({ id, verdict, agentId, ownerUserId, createdAt });

  it("counts independent owners per side, excluding the filer, undone and pre-edit reviews", () => {
    const tally = confirmationTally({
      createdByAgentId: "filer",
      undoneIds: new Set(["gone"]),
      revisionCutoff: new Date("2026-10-31T00:00:00Z"),
      bug,
      reviews: [
        rev("a1", "accept", "a", "one"), // 1 approval
        rev("a2", "accept", "b", "one"), // same owner: still 1 approval
        rev("r1", "reject", "c", "two"), // 1 rejection
        rev("r2", "reject", "d", "three"), // 2 rejections
        rev("f", "accept", "filer", "four"), // the filer's own agent: ignored
        rev("gone", "accept", "e", "five"), // undone: ignored
        rev("old", "reject", "g", "six", new Date("2026-10-30T00:00:00Z")), // before the edit: ignored
        rev("n", "neutral", "h", "seven"), // neutral: adds to neither
      ],
    });
    expect(tally).toEqual({ approvals: 1, rejections: 2 });
  });

  it("ignores a reviewer whose owner owns the ticket", () => {
    const tally = confirmationTally({
      createdByAgentId: null,
      undoneIds: new Set(),
      revisionCutoff: null,
      bug,
      reviews: [rev("x", "accept", "x", "reporter"), rev("y", "reject", "y", "two")],
    });
    expect(tally).toEqual({ approvals: 0, rejections: 1 });
  });

  it("is 0/0 with no reviews", () => {
    expect(
      confirmationTally({ createdByAgentId: null, reviews: [], undoneIds: new Set(), revisionCutoff: null, bug }),
    ).toEqual({ approvals: 0, rejections: 0 });
  });
});

describe("tallyLead (#741)", () => {
  it("names the side that leads, and a tie otherwise", () => {
    expect(tallyLead({ approvals: 2, rejections: 1 })).toBe("approvals");
    expect(tallyLead({ approvals: 1, rejections: 2 })).toBe("rejections");
    expect(tallyLead({ approvals: 1, rejections: 1 })).toBe("tie");
    expect(tallyLead({ approvals: 0, rejections: 0 })).toBe("tie");
  });
});
