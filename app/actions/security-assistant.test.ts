import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  addTargetAndCheck: vi.fn(),
  ask: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1", role: "member" }) }));
vi.mock("@/lib/organisation-access", () => ({ currentOrganisationAccess: mocks.access }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate, RATE_LIMIT_MESSAGE: "Slow down." }));
vi.mock("@/lib/security-checks/entry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security-checks/entry")>()),
  addTargetAndCheck: mocks.addTargetAndCheck,
}));
vi.mock("@/lib/security-checks/assistant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security-checks/assistant")>()),
  askSecurityAssistant: mocks.ask,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { talkToSecurityAssistant } from "./security-assistant";

const say = (text: string) => [{ role: "user" as const, text }];

describe("talkToSecurityAssistant (#security-checks, plan C3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ organisationId: "org1", admin: false });
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.addTargetAndCheck.mockResolvedValue({ targetId: "t1", checkId: "c1", verified: false, reused: false });
  });

  it("adds a plain link straight away, without the AI, and goes on to Show it's yours", async () => {
    const answer = await talkToSecurityAssistant(say("https://www.settle.ng"));
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(mocks.addTargetAndCheck).toHaveBeenCalledWith("org1", "u1", expect.objectContaining({ kind: "website", value: "settle.ng" }));
    expect(answer).toMatchObject({ kind: "go", href: "/security/targets/t1/verify" });
  });

  it("sends a site that is already proven back to Your sites, where its free scan starts", async () => {
    mocks.addTargetAndCheck.mockResolvedValue({ targetId: "t1", checkId: "c9", verified: true, reused: false });
    const answer = await talkToSecurityAssistant(say("settle.ng"));
    expect(answer).toMatchObject({ kind: "go", href: "/security?check=c9&added=1" });
  });

  it("refuses a private address without asking the AI", async () => {
    const answer = await talkToSecurityAssistant(say("192.168.1.1"));
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(mocks.addTargetAndCheck).not.toHaveBeenCalled();
    expect(answer.kind).toBe("reply");
  });

  it("lets the AI answer plain words, and adds the site it picks out after checking it again", async () => {
    mocks.ask.mockResolvedValue({ reply: "Great, next show it's yours.", target: "my site is settle.ng" });
    expect(await talkToSecurityAssistant(say("I want to secure my shop"))).toMatchObject({ kind: "reply" });
    expect(mocks.addTargetAndCheck).not.toHaveBeenCalled();

    mocks.ask.mockResolvedValue({ reply: "Great, next show it's yours.", target: "settle.ng" });
    const answer = await talkToSecurityAssistant(say("It's settle dot ng, the website"));
    expect(answer).toMatchObject({ kind: "go", reply: "Great, next show it's yours.", href: "/security/targets/t1/verify" });
  });

  it("never adds a private address the AI picks out", async () => {
    mocks.ask.mockResolvedValue({ reply: "Okay.", target: "10.0.0.4" });
    const answer = await talkToSecurityAssistant(say("check my server at ten zero zero four"));
    expect(mocks.addTargetAndCheck).not.toHaveBeenCalled();
    expect(answer.kind).toBe("reply");
  });

  it("asks for the address plainly when the AI can't answer, and stops at the rate limit", async () => {
    mocks.ask.mockResolvedValue(null);
    const answer = await talkToSecurityAssistant(say("hello"));
    expect(answer).toMatchObject({ kind: "reply" });
    expect((answer as { reply: string }).reply).toMatch(/website, a server address or a GitHub repo/);

    mocks.rate.mockReturnValue({ allowed: false });
    expect(await talkToSecurityAssistant(say("hello again"))).toEqual({ kind: "error", error: "Slow down." });
    expect(mocks.ask).toHaveBeenCalledTimes(1);
  });

  it("needs a workspace", async () => {
    mocks.access.mockResolvedValue({ organisationId: null, admin: false });
    expect((await talkToSecurityAssistant(say("settle.ng"))).kind).toBe("error");
  });
});
