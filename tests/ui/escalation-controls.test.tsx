// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: mockRefresh,
  }),
}));

const answerInlineEscalationAction = vi.hoisted(() => vi.fn());
const quickResolveEscalationAction = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/inbox/actions", () => ({
  answerInlineEscalationAction,
  quickResolveEscalationAction,
}));

import {
  extractSuggestedReplies,
  InlineAgentReplyBox,
  QuickResolveButtons,
} from "@/app/(app)/inbox/escalation-controls";

describe("extractSuggestedReplies", () => {
  it("extracts binary options from explicit choice questions", () => {
    expect(extractSuggestedReplies("Should I add a unit test, or use an integration test?")).toEqual([
      "Add a unit test",
      "Use an integration test",
    ]);

    expect(extractSuggestedReplies("Would you prefer to retry the build, or cancel the run?")).toEqual([
      "Retry the build",
      "Cancel the run",
    ]);

    expect(extractSuggestedReplies("Do you want me to refactor this, or keep as is?")).toEqual([
      "Refactor this",
      "Keep as is",
    ]);
  });

  it("returns empty array for multi-or questions or lists", () => {
    expect(extractSuggestedReplies("Should I refactor or rewrite the parser, or leave it?")).toEqual([]);
    expect(extractSuggestedReplies("Should I pick option A, option B, or option C?")).toEqual([]);
  });

  it("returns empty array for factual questions and blockers", () => {
    expect(extractSuggestedReplies("Where can I find the staging database credentials?")).toEqual([]);
    expect(extractSuggestedReplies("Missing permission to access production S3 bucket")).toEqual([]);
  });

  it("returns standard approval options for approval escalation types", () => {
    expect(extractSuggestedReplies("Requesting permission to increase scope", "Scope Expansion")).toEqual([
      "Proceed as proposed",
      "Decline",
    ]);
    expect(extractSuggestedReplies("Authorization needed to install new dependency", "Work Authorization")).toEqual([
      "Proceed as proposed",
      "Decline",
    ]);
    expect(extractSuggestedReplies("Need review before deploying", "Human Approval")).toEqual([
      "Proceed as proposed",
      "Decline",
    ]);
  });
});

describe("QuickResolveButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders approve, authorize, and reject buttons", () => {
    render(<QuickResolveButtons escalationId="esc-1" />);

    expect(screen.getByRole("button", { name: /✓ Approve & Unblock/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Authorize Work/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject/i })).toBeInTheDocument();
  });

  it("handles approve action click", async () => {
    quickResolveEscalationAction.mockResolvedValueOnce({ ok: true });
    const onResolved = vi.fn();

    render(<QuickResolveButtons escalationId="esc-1" onResolved={onResolved} />);

    fireEvent.click(screen.getByRole("button", { name: /✓ Approve & Unblock/i }));

    await waitFor(() => {
      expect(quickResolveEscalationAction).toHaveBeenCalledWith("esc-1", "approve");
      expect(onResolved).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("handles authorize action click", async () => {
    quickResolveEscalationAction.mockResolvedValueOnce({ ok: true });
    render(<QuickResolveButtons escalationId="esc-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Authorize Work/i }));

    await waitFor(() => {
      expect(quickResolveEscalationAction).toHaveBeenCalledWith("esc-1", "authorize");
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("handles reject action click", async () => {
    quickResolveEscalationAction.mockResolvedValueOnce({ ok: true });
    render(<QuickResolveButtons escalationId="esc-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Reject/i }));

    await waitFor(() => {
      expect(quickResolveEscalationAction).toHaveBeenCalledWith("esc-1", "reject");
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("displays error message when action fails", async () => {
    quickResolveEscalationAction.mockResolvedValueOnce({ ok: false, error: "Only the owner can answer." });
    render(<QuickResolveButtons escalationId="esc-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Reject/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Only the owner can answer.");
    });
  });
});

describe("InlineAgentReplyBox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders suggested reply pills for binary choice question and dispatches on pill click", async () => {
    answerInlineEscalationAction.mockResolvedValueOnce({ ok: true });
    const onResolved = vi.fn();

    render(
      <InlineAgentReplyBox
        escalationId="esc-2"
        body="Should I add a unit test, or use an integration test?"
        onResolved={onResolved}
      />,
    );

    expect(screen.getByText("Quick replies:")).toBeInTheDocument();
    const pill1 = screen.getByRole("button", { name: "Add a unit test" });
    const pill2 = screen.getByRole("button", { name: "Use an integration test" });
    expect(pill1).toBeInTheDocument();
    expect(pill2).toBeInTheDocument();

    fireEvent.click(pill1);

    await waitFor(() => {
      expect(answerInlineEscalationAction).toHaveBeenCalledWith("esc-2", "Add a unit test");
      expect(onResolved).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("does not render quick reply row when there are no suggestions", () => {
    render(
      <InlineAgentReplyBox
        escalationId="esc-3"
        body="What is the production deployment schedule?"
        type="Question"
      />,
    );

    expect(screen.queryByText("Quick replies:")).not.toBeInTheDocument();
  });

  it("submits custom inline text answer and clears input upon success", async () => {
    answerInlineEscalationAction.mockResolvedValueOnce({ ok: true });
    const onResolved = vi.fn();

    render(
      <InlineAgentReplyBox
        escalationId="esc-4"
        body="Any specific guidance?"
        onResolved={onResolved}
      />,
    );

    const input = screen.getByPlaceholderText("Reply to agent...");
    const sendButton = screen.getByRole("button", { name: "Send" });

    expect(sendButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "Please proceed with approach B" } });
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(answerInlineEscalationAction).toHaveBeenCalledWith("esc-4", "Please proceed with approach B");
      expect(onResolved).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(input).toHaveValue("");
    });
  });

  it("renders error alert if answering fails", async () => {
    answerInlineEscalationAction.mockResolvedValueOnce({ ok: false, error: "Network timeout." });

    render(
      <InlineAgentReplyBox
        escalationId="esc-5"
        body="Any specific guidance?"
      />,
    );

    const input = screen.getByPlaceholderText("Reply to agent...");
    fireEvent.change(input, { target: { value: "Deploy now" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network timeout.");
    });
  });
});
