import { describe, expect, it } from "vitest";
import { issueEntryEdit } from "@/lib/agent-api/history";

describe("legacy test-verdict history actions", () => {
  it("keeps the original endpoint and CLI command for existing test verdicts", () => {
    expect(issueEntryEdit(
      "test_verdict",
      { id: "issue-1", substatus: "requires_review", projectId: "project-1" },
      { agentId: "agent-1" },
      "agent-1",
    )).toEqual({
      method: "POST",
      path: "/api/v1/issues/issue-1/test-results?projectId=project-1",
      cli: "submit-test-result --id issue-1 --good-to-merge true|false --summary <your verdict> --description <what you tested and why>",
    });
  });

  it("does not offer another agent's legacy verdict for replacement", () => {
    expect(issueEntryEdit(
      "test_verdict",
      { id: "issue-1", substatus: "requires_review", projectId: "project-1" },
      { agentId: "agent-1" },
      "agent-2",
    )).toBeNull();
  });
});
