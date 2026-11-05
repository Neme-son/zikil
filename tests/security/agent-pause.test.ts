import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  issueClaim: { updateMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const audit = vi.hoisted(() => vi.fn());
const isTenantAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/agents/audit", () => ({ audit }));
vi.mock("@/lib/agents/membership", () => ({ isTenantAdmin }));

import { isPauseOver, pauseAgent, pauseAllAgents, PAUSE_CAP_HOURS, resumeAgent } from "@/lib/agents/pause";
import { AgentPausedError, agentWorkStatus, assertAgentMayWork } from "@/lib/agents/work-gate";
import { agentErrorResponse } from "@/lib/agents/require-agent";

const ada = { id: "ada", role: "user" as const };
const agentRow = (overrides: Record<string, unknown> = {}) => ({
  id: "agent1",
  tenantId: "tenant_zedu",
  ownerUserId: "ada",
  revokedAt: null,
  pausedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.agent.updateMany.mockResolvedValue({ count: 1 });
  db.issueClaim.updateMany.mockResolvedValue({ count: 0 });
  db.issueClaim.findMany.mockResolvedValue([]);
  isTenantAdmin.mockResolvedValue(false);
});

/** Pause and resume (#236): an owner stops their agent mid-work and lets it carry on without losing time. */
describe("pausing an agent (#236)", () => {
  it("pauses the agent and stops the clocks on every issue it is working on", async () => {
    const now = new Date("2026-11-05T12:00:00Z");
    db.agent.findUnique.mockResolvedValue(agentRow());
    db.issueClaim.updateMany.mockResolvedValue({ count: 2 });

    await expect(pauseAgent(ada, "agent1", now)).resolves.toEqual({ ok: true, changed: true });

    expect(db.agent.updateMany).toHaveBeenCalledWith({
      where: { id: "agent1", pausedAt: null, revokedAt: null },
      data: { pausedAt: now },
    });
    expect(db.issueClaim.updateMany).toHaveBeenCalledWith({
      where: { agentId: "agent1", status: "active", releasedAt: null, pausedSince: null },
      data: { pausedSince: now },
    });
    expect(audit).toHaveBeenCalledWith(
      { agentId: "agent1", tenantId: "tenant_zedu" },
      "agent.paused",
      "agent:agent1",
      { by: "owner", claimsPaused: 2 },
      expect.objectContaining({ actorUserId: "ada" }),
    );
  });

  it("refuses someone who neither owns the agent nor runs its workspace", async () => {
    db.agent.findUnique.mockResolvedValue(agentRow({ ownerUserId: "bola" }));
    const result = await pauseAgent(ada, "agent1");
    expect(result.ok).toBe(false);
    expect(db.agent.updateMany).not.toHaveBeenCalled();
  });

  it("lets a workspace admin pause someone else's agent, and records that it was them", async () => {
    db.agent.findUnique.mockResolvedValue(agentRow({ ownerUserId: "bola" }));
    isTenantAdmin.mockResolvedValue(true);
    await expect(pauseAgent(ada, "agent1")).resolves.toEqual({ ok: true, changed: true });
    expect(audit.mock.calls[0][3]).toMatchObject({ by: "tenant_admin" });
  });

  it("won't pause a revoked agent, and pausing twice changes nothing", async () => {
    db.agent.findUnique.mockResolvedValueOnce(agentRow({ revokedAt: new Date() }));
    expect((await pauseAgent(ada, "agent1")).ok).toBe(false);
    db.agent.findUnique.mockResolvedValueOnce(agentRow({ pausedAt: new Date() }));
    await expect(pauseAgent(ada, "agent1")).resolves.toEqual({ ok: true, changed: false });
    expect(db.agent.updateMany).not.toHaveBeenCalled();
  });

  it("on resume, adds the paused time back to each deadline and silence clock", async () => {
    const pausedAt = new Date("2026-11-05T12:00:00Z");
    const now = new Date("2026-11-05T13:30:00Z"); // paused for 90 minutes
    db.agent.findUnique
      .mockResolvedValueOnce(agentRow({ pausedAt }))
      .mockResolvedValueOnce({ pausedAt });
    db.issueClaim.findMany.mockResolvedValue([
      {
        id: "claim1",
        pausedSince: pausedAt,
        deliverBy: new Date("2026-11-05T14:00:00Z"),
        lastHeartbeatAt: new Date("2026-11-05T11:55:00Z"),
        claimedAt: new Date("2026-11-05T11:00:00Z"),
      },
    ]);

    await expect(resumeAgent(ada, "agent1", now)).resolves.toEqual({ ok: true, changed: true });

    expect(db.agent.update).toHaveBeenCalledWith({ where: { id: "agent1" }, data: { pausedAt: null } });
    expect(db.issueClaim.update).toHaveBeenCalledWith({
      where: { id: "claim1" },
      data: {
        pausedSince: null,
        deliverBy: new Date("2026-11-05T15:30:00Z"),
        lastHeartbeatAt: new Date("2026-11-05T13:25:00Z"),
      },
    });
    expect(audit.mock.calls[0][1]).toBe("agent.resumed");
    expect(audit.mock.calls[0][3]).toMatchObject({ claimsResumed: 1, pausedMinutes: 90 });
  });

  it("Pause all pauses every working agent the person owns in the workspace", async () => {
    db.agent.findMany.mockResolvedValue([
      { id: "a1", tenantId: "tenant_zedu" },
      { id: "a2", tenantId: "tenant_zedu" },
    ]);
    await expect(pauseAllAgents(ada, "tenant_zedu")).resolves.toEqual({ ok: true, changed: 2 });
    expect(db.agent.findMany).toHaveBeenCalledWith({
      where: { ownerUserId: "ada", tenantId: "tenant_zedu", revokedAt: null, pausedAt: null },
      select: { id: true, tenantId: true },
    });
    expect(db.agent.updateMany).toHaveBeenCalledTimes(2);
  });

  it("hands a claim back only once a pause has lasted the cap", () => {
    const since = new Date("2026-11-05T00:00:00Z");
    const justUnder = new Date(since.getTime() + PAUSE_CAP_HOURS * 3_600_000 - 1);
    expect(isPauseOver(since, justUnder)).toBe(false);
    expect(isPauseOver(since, new Date(since.getTime() + PAUSE_CAP_HOURS * 3_600_000))).toBe(true);
  });
});

describe("the work gate while paused (#236)", () => {
  const ready = { username: "ada-claude", tagline: "Patient bug hunter", about: "I reproduce first.", skillCount: 1 };
  const pausedAt = new Date("2026-11-05T12:00:00Z");
  const at = (method: string, path: string) => ({ method, url: `http://localhost${path}` });

  it("lets a paused agent read but refuses everything that acts", () => {
    const agent = { ...ready, pausedAt };
    for (const [method, path] of [
      ["GET", "/api/v1/agents/me"],
      ["GET", "/zedu/demo/work"],
      ["GET", "/api/v1/inbox"],
      ["PATCH", "/api/v1/agents/me"],
    ]) {
      expect(() => assertAgentMayWork(agent, at(method, path)), `${method} ${path}`).not.toThrow();
    }
    for (const [method, path] of [
      ["POST", "/api/v1/ideas"],
      ["POST", "/api/v1/issues/abc/bid"],
      ["POST", "/api/v1/issues/abc/heartbeat"],
      ["POST", "/api/v1/issues/abc/delivery"],
      ["DELETE", "/api/v1/issues/abc/comments/c1"],
    ]) {
      expect(() => assertAgentMayWork(agent, at(method, path)), `${method} ${path}`).toThrow(AgentPausedError);
    }
    expect(() => assertAgentMayWork({ ...ready, pausedAt: null }, at("POST", "/api/v1/ideas"))).not.toThrow();
  });

  it("answers 403 agent_paused, and /agents/me says why it may not work", async () => {
    const response = agentErrorResponse(new AgentPausedError("ada-claude", pausedAt));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ error: "agent_paused", paused_at: pausedAt.toISOString() });
    expect(body.message).toMatch(/paused/);

    expect(agentWorkStatus({ ...ready, pausedAt })).toMatchObject({ may_work: false, reason: "agent_paused" });
    expect(agentWorkStatus(ready)).toEqual({ may_work: true });
  });

  it("still asks an unfinished profile to be set up first", () => {
    const agent = { username: "ada-claude", tagline: null, about: null, skillCount: 0, pausedAt };
    expect(agentWorkStatus(agent)).toMatchObject({ reason: "profile_incomplete" });
  });
});
