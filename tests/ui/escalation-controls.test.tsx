// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const requireUserMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireUser: () => requireUserMock(),
}));

const currentTenantIdForMock = vi.fn();
vi.mock("@/lib/tenant-context", () => ({
  currentTenantIdFor: (...args: unknown[]) => currentTenantIdForMock(...args),
}));

const answerAgentQuestionMock = vi.fn();
const listOwnerQuestionsMock = vi.fn();
vi.mock("@/lib/agent-questions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent-questions")>(
    "@/lib/agent-questions",
  );
  return {
    ...actual,
    answerAgentQuestion: (...args: unknown[]) => answerAgentQuestionMock(...args),
    listOwnerQuestions: (...args: unknown[]) => listOwnerQuestionsMock(...args),
  };
});

const listAgentThreadMock = vi.fn();
vi.mock("@/lib/agent-messages", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent-messages")>(
    "@/lib/agent-messages",
  );
  return {
    ...actual,
    listAgentThread: (...args: unknown[]) => listAgentThreadMock(...args),
  };
});

const redesignFindManyMock = vi.fn();
const issueClaimFindManyMock = vi.fn();
const agentFindManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    redesignProposal: {
      findMany: (...args: unknown[]) => redesignFindManyMock(...args),
    },
    issueClaim: {
      findMany: (...args: unknown[]) => issueClaimFindManyMock(...args),
    },
    agent: {
      findMany: (...args: unknown[]) => agentFindManyMock(...args),
    },
  },
}));

vi.mock("@/app/(app)/agent/[username]/message-forms", () => ({
  SendMessageForm: () => <div data-testid="send-message-form" />,
}));

import {
  extractSuggestedReplies,
  InlineAgentReplyBox,
  QuickResolveButtons,
} from "@/app/(app)/inbox/escalation-controls";
import {
  answerEscalationAction,
  answerInlineEscalationAction,
  quickResolveEscalationAction,
} from "@/app/(app)/inbox/actions";
import { EscalationsView } from "@/app/(app)/inbox/escalations-view";
import { MessagesView } from "@/app/(app)/inbox/messages-view";

describe("extractSuggestedReplies", () => {
  it("parses explicit two-option A-or-B choices from an agent's question sentence", () => {
    const body =
      "Two parallel requests can still race during refresh. Should I serialize all token refreshes with a mutex, or only lock /api/auth/refresh?";
    const replies = extractSuggestedReplies(body, "Blocker");
    expect(replies).toEqual([
      {
        label: "Serialize all token refreshes with a mutex",
        value: "Serialize all token refreshes with a mutex.",
      },
      {
        label: "Only lock /api/auth/refresh",
        value: "Only lock /api/auth/refresh.",
      },
    ]);
  });

  it("returns no pills when the sentence has more than one 'or' and is ambiguous", () => {
    expect(
      extractSuggestedReplies(
        "Should I refactor or rewrite the parser, or leave it?",
        "Scope Expansion",
      ),
    ).toEqual([]);
    expect(
      extractSuggestedReplies(
        "Do you want me to use Redis, Postgres, or an in-memory map?",
        "Question",
      ),
    ).toEqual([]);
  });

  it("returns no fallback pills for factual Question or Blocker escalations without A-or-B options", () => {
    expect(
      extractSuggestedReplies("Which environment variable holds the webhook secret?", "Question"),
    ).toEqual([]);
    expect(
      extractSuggestedReplies("Staging database connection is timing out on port 5432.", "Blocker"),
    ).toEqual([]);
  });

  it("falls back to approval quick replies only for approval-oriented types", () => {
    expect(
      extractSuggestedReplies(
        "Need approval before touching the migration script.",
        "Scope Expansion",
      ).map((r) => r.label),
    ).toEqual(["Approve expanded scope", "Keep strictly to ticket scope"]);

    expect(
      extractSuggestedReplies("Ready to begin implementation.", "Work Authorization").map(
        (r) => r.label,
      ),
    ).toEqual(["Authorize work", "Decline"]);

    expect(
      extractSuggestedReplies("Proposed layout changes ready for sign-off.", "Human Approval").map(
        (r) => r.label,
      ),
    ).toEqual(["Approve approach", "Decline"]);
  });
});

describe("InlineAgentReplyBox & QuickResolveButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "user-1" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    answerAgentQuestionMock.mockResolvedValue({ id: "esc-1" });
  });

  it("renders Quick replies pills, fills the input, and submits via answerInlineEscalationAction", async () => {
    render(
      <InlineAgentReplyBox
        escalationId="esc-1"
        agentName="Codex Solver"
        cleanBody="Should I use a per-session lock, or fall back to an optimistic retry?"
        escalationType="Blocker"
      />,
    );

    expect(screen.getByText("Quick replies:")).toBeTruthy();
    const pillA = screen.getByRole("button", { name: "Use a per-session lock" });
    fireEvent.click(pillA);

    const input = screen.getByLabelText("Reply to Codex Solver") as HTMLInputElement;
    expect(input.value).toBe("Use a per-session lock.");

    fireEvent.click(screen.getByRole("button", { name: "Reply & unblock" }));
    await waitFor(() => {
      expect(answerAgentQuestionMock).toHaveBeenCalledWith(
        "user-1",
        "tenant-1",
        "esc-1",
        "Use a per-session lock.",
      );
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("shows an error alert when sending the inline reply fails", async () => {
    currentTenantIdForMock.mockResolvedValueOnce(null);

    render(
      <InlineAgentReplyBox
        escalationId="esc-1"
        agentName="Codex Solver"
        cleanBody="Which port should the worker bind to?"
        escalationType="Question"
      />,
    );

    const input = screen.getByLabelText("Reply to Codex Solver");
    fireEvent.change(input, { target: { value: "Use port 4000." } });
    fireEvent.click(screen.getByRole("button", { name: "Reply & unblock" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Workspace membership required.");
  });

  it("renders Approve, Authorize, and Reject in QuickResolveButtons and sends Decline on Reject", async () => {
    render(<QuickResolveButtons escalationId="esc-2" />);

    expect(screen.getByRole("button", { name: "✓ Approve & Unblock" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Authorize Work" })).toBeTruthy();
    const rejectBtn = screen.getByRole("button", { name: "Reject" });

    fireEvent.click(rejectBtn);
    await waitFor(() => {
      expect(answerAgentQuestionMock).toHaveBeenCalledWith(
        "user-1",
        "tenant-1",
        "esc-2",
        "Declined. Do not proceed with this direction.",
      );
    });
  });
});

describe("inbox actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "user-1" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    answerAgentQuestionMock.mockResolvedValue({ id: "esc-9" });
  });

  it("shares validation and submission logic across answerEscalationAction, answerInlineEscalationAction, and quickResolveEscalationAction", async () => {
    expect(await answerInlineEscalationAction("esc-9", "   ")).toEqual({
      ok: false,
      error: "Write an answer before sending it.",
    });

    const fd = new FormData();
    fd.set("escalationId", "esc-9");
    fd.set("answer", "Proceed with option A.");
    expect(await answerEscalationAction(undefined, fd)).toEqual({ ok: true });
    expect(answerAgentQuestionMock).toHaveBeenCalledWith(
      "user-1",
      "tenant-1",
      "esc-9",
      "Proceed with option A.",
    );

    expect(await quickResolveEscalationAction("esc-9", "reject")).toEqual({ ok: true });
    expect(answerAgentQuestionMock).toHaveBeenCalledWith(
      "user-1",
      "tenant-1",
      "esc-9",
      "Declined. Do not proceed with this direction.",
    );
  });
});

describe("EscalationsView & MessagesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "owner-1" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    redesignFindManyMock.mockResolvedValue([]);
  });

  it("filters paused claims by the signed-in owner and renders 'Claim paused · Waiting on you'", async () => {
    listOwnerQuestionsMock.mockResolvedValue([
      {
        id: "q-paused",
        body: "[Escalation: Scope Expansion]\n\nShould I patch recovery too, or keep this PR strictly to sign-in?",
        answer: null,
        answeredAt: null,
        bugId: "bug-1",
        createdAt: new Date("2026-11-05T12:00:00Z"),
        agent: { id: "agent-1", name: "Atlas" },
        bug: { number: 2, title: "Sign-in spinner bug", project: { slug: "zedu" } },
      },
      {
        id: "q-normal",
        body: "[Escalation: Question]\n\nWhich branch should I target?",
        answer: null,
        answeredAt: null,
        bugId: "bug-2",
        createdAt: new Date("2026-11-05T11:00:00Z"),
        agent: { id: "agent-1", name: "Atlas" },
        bug: { number: 3, title: "Branch config", project: { slug: "zedu" } },
      },
    ]);
    issueClaimFindManyMock.mockResolvedValue([
      {
        agentId: "agent-1",
        bugId: "bug-1",
        waitingOnOwnerSince: new Date("2026-11-05T12:00:00Z"),
      },
    ]);

    const ui = await EscalationsView({ searchParams: Promise.resolve({ status: "waiting" }) });
    render(ui);

    expect(issueClaimFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agent: { tenantId: "tenant-1", ownerUserId: "owner-1" },
        }),
      }),
    );

    expect(screen.getByText("Claim paused · Waiting on you")).toBeTruthy();
    expect(screen.getByText("Waiting on you")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Reject" }).length).toBe(2);
  });

  it("renders cleaned question text and InlineAgentReplyBox in MessagesView", async () => {
    agentFindManyMock.mockResolvedValue([
      { id: "agent-1", name: "Atlas", username: "atlas", avatar: null, picture: null },
    ]);
    listAgentThreadMock.mockResolvedValue({
      entries: [
        {
          kind: "question",
          id: "q-msg-1",
          body: "[blocker] Should I darken the token globally, or override it locally?",
          createdAt: new Date("2026-11-05T12:00:00Z"),
          answeredAt: null,
          answer: null,
          bug: { number: 7, title: "Contrast fix", project: { slug: "zedu" } },
        },
      ],
    });

    const ui = await MessagesView({ agent: "atlas" });
    render(ui);

    expect(
      screen.getByText("Should I darken the token globally, or override it locally?"),
    ).toBeTruthy();
    expect(screen.queryByText(/\[blocker\]/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Darken the token globally" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reply & unblock" })).toBeTruthy();
  });
});
