import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock prisma before imports
// ---------------------------------------------------------------------------
/** A state change and its event go together (#524): an event is broadcast only once its row is committed, never for a rolled-back write. */
const db = vi.hoisted(() => ({
  agentEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  webhookSubscription: { findMany: vi.fn() },
  webhookDelivery: { createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { publish, broadcastWhenCommitted, clearRecentPublishedEvents, EVENT_DEDUP_WINDOW_MS } from "@/lib/agent-api/events";
import { eventStreamBus, type StreamEvent } from "@/lib/events/stream-bus";

function streamEvent(id: string): StreamEvent {
  return {
    id,
    type: "issue.confirmation",
    payload: { bugId: "bug-1" },
    actorAgentId: "agent-a",
    bugId: "bug-1",
    organisationId: "organisation-a",
    createdAt: new Date("2026-10-22T07:37:59.000Z"),
  };
}

/**
 * #524: an event and the row it describes have to land together. Publishing
 * inside the writing transaction let a subscriber read an event whose change
 * was not there yet, and a rolled-back transaction still emitted its event.
 */
describe("event broadcast waits for the committed row (#524)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearRecentPublishedEvents();
    db.agentEvent.findUnique.mockReset();
  });

  it("drops the event when the transaction rolled back and the row never appears", async () => {
    db.agentEvent.findUnique.mockResolvedValue(null);
    const broadcast = vi.spyOn(eventStreamBus, "broadcast");

    const sent = await broadcastWhenCommitted(streamEvent("evt-rolled-back"), { attempts: 3, delayMs: 1 });

    expect(sent).toBe(false);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("broadcasts once the row is visible", async () => {
    db.agentEvent.findUnique.mockResolvedValue({ id: "evt-committed" });
    const broadcast = vi.spyOn(eventStreamBus, "broadcast");

    const sent = await broadcastWhenCommitted(streamEvent("evt-committed"), { attempts: 3, delayMs: 1 });

    expect(sent).toBe(true);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-committed", type: "issue.confirmation" }),
    );
  });

  it("waits for a transaction that is still running", async () => {
    db.agentEvent.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "evt-late" });
    const broadcast = vi.spyOn(eventStreamBus, "broadcast");

    const sent = await broadcastWhenCommitted(streamEvent("evt-late"), { attempts: 3, delayMs: 1 });

    expect(sent).toBe(true);
    expect(db.agentEvent.findUnique).toHaveBeenCalledTimes(2);
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it("publishes nothing before the writing transaction commits", async () => {
    // The row is invisible to other connections while the transaction runs,
    // so the event must not reach subscribers yet.
    db.agentEvent.create.mockResolvedValue({ id: "evt-pending" });
    db.webhookSubscription.findMany.mockResolvedValue([]);
    db.agentEvent.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "evt-pending" });
    const broadcast = vi.spyOn(eventStreamBus, "broadcast");

    const result = await publish(db as unknown as Parameters<typeof publish>[0], {
      organisationId: "organisation-a",
      type: "issue.confirmation",
      payload: { bugId: "bug-1" },
      actorAgentId: "agent-a",
      bugId: "bug-1",
    });

    expect(result.id).toBe("evt-pending");
    expect(broadcast).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(broadcast).toHaveBeenCalledTimes(1));
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ id: "evt-pending" }));
  });

  it("drops the event when the row lookup keeps failing", async () => {
    // A failing lookup leaves the row's visibility unknown, so the event may
    // describe a change that never happened. It must not be sent on a guess.
    db.agentEvent.findUnique.mockRejectedValue(new Error("connection lost"));
    const broadcast = vi.spyOn(eventStreamBus, "broadcast");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sent = await broadcastWhenCommitted(streamEvent("evt-unknown"), { attempts: 3, delayMs: 1 });

    expect(sent).toBe(false);
    expect(broadcast).not.toHaveBeenCalled();
    expect(db.agentEvent.findUnique).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});

describe("publisher event deduplication (#868)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearRecentPublishedEvents();
    db.agentEvent.create.mockReset();
    db.agentEvent.findUnique.mockReset().mockResolvedValue({ id: "evt" });
    db.webhookSubscription.findMany.mockReset().mockResolvedValue([]);
    db.webhookDelivery.createMany.mockReset();
  });

  it("suppresses duplicate events at the publisher level within the deduplication window", async () => {
    db.agentEvent.create.mockResolvedValueOnce({ id: "evt-initial" });

    const first = await publish(db as unknown as Parameters<typeof publish>[0], {
      organisationId: "org-1",
      type: "issue.created",
      bugId: "bug-123",
      payload: { issueId: "bug-123", title: "New bug" },
    });

    expect(first.id).toBe("evt-initial");
    expect(db.agentEvent.create).toHaveBeenCalledTimes(1);

    // Call publish again with identical parameters within the deduplication window
    const second = await publish(db as unknown as Parameters<typeof publish>[0], {
      organisationId: "org-1",
      type: "issue.created",
      bugId: "bug-123",
      payload: { issueId: "bug-123", title: "New bug" },
    });

    // Returns original event id without creating duplicate agentEvent or webhooks
    expect(second.id).toBe("evt-initial");
    expect(db.agentEvent.create).toHaveBeenCalledTimes(1);
    expect(db.webhookDelivery.createMany).not.toHaveBeenCalled();
  });

  it("publishes distinct events independently", async () => {
    db.agentEvent.create
      .mockResolvedValueOnce({ id: "evt-1" })
      .mockResolvedValueOnce({ id: "evt-2" });

    const first = await publish(db as unknown as Parameters<typeof publish>[0], {
      organisationId: "org-1",
      type: "issue.created",
      bugId: "bug-1",
      payload: { issueId: "bug-1" },
    });

    const second = await publish(db as unknown as Parameters<typeof publish>[0], {
      organisationId: "org-1",
      type: "issue.created",
      bugId: "bug-2",
      payload: { issueId: "bug-2" },
    });

    expect(first.id).toBe("evt-1");
    expect(second.id).toBe("evt-2");
    expect(db.agentEvent.create).toHaveBeenCalledTimes(2);
  });

  it("suppresses repeating review.requested even when volatile expiresAt changes", async () => {
    db.agentEvent.create.mockResolvedValueOnce({ id: "evt-review-req" });

    const first = await publish(db as unknown as Parameters<typeof publish>[0], {
      organisationId: "org-1",
      type: "review.requested",
      bugId: "bug-100",
      payload: {
        offerId: "offer-1",
        issueId: "bug-100",
        agentId: "agent-reviewer",
        expiresAt: "2026-11-12T10:00:00.000Z",
      },
    });

    expect(first.id).toBe("evt-review-req");
    expect(db.agentEvent.create).toHaveBeenCalledTimes(1);

    // Repeated publication with slightly shifted expiresAt
    const second = await publish(db as unknown as Parameters<typeof publish>[0], {
      organisationId: "org-1",
      type: "review.requested",
      bugId: "bug-100",
      payload: {
        offerId: "offer-1",
        issueId: "bug-100",
        agentId: "agent-reviewer",
        expiresAt: "2026-11-12T10:01:00.000Z",
      },
    });

    expect(second.id).toBe("evt-review-req");
    expect(db.agentEvent.create).toHaveBeenCalledTimes(1);
  });

  it("publishes a new event after the deduplication window expires", async () => {
    vi.useFakeTimers();
    const startTime = Date.parse("2026-11-12T12:00:00.000Z");
    vi.setSystemTime(startTime);

    db.agentEvent.create
      .mockResolvedValueOnce({ id: "evt-early" })
      .mockResolvedValueOnce({ id: "evt-later" });

    const first = await publish(db as unknown as Parameters<typeof publish>[0], {
      organisationId: "org-1",
      type: "comment.created",
      bugId: "bug-1",
      payload: { commentId: "c-1" },
    });
    expect(first.id).toBe("evt-early");
    expect(db.agentEvent.create).toHaveBeenCalledTimes(1);

    // Advance past the deduplication window
    vi.setSystemTime(startTime + EVENT_DEDUP_WINDOW_MS + 5_000);

    const second = await publish(db as unknown as Parameters<typeof publish>[0], {
      organisationId: "org-1",
      type: "comment.created",
      bugId: "bug-1",
      payload: { commentId: "c-1" },
    });
    expect(second.id).toBe("evt-later");
    expect(db.agentEvent.create).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
