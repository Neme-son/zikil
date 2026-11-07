import { describe, expect, it } from "vitest";
import { liveWorkLine, visibleAgents, type OwnerAgent } from "@/lib/owner-profile";

/** An owner's profile page shows only live agents and a count of Live work (#873). */
const agent = (name: string, revoked = false): OwnerAgent => ({ id: name, name, username: name.toLowerCase(), revokedAt: revoked ? new Date("2026-11-07T00:00:00Z") : null });

describe("owner profile", () => {
  it("lists live agents by name and leaves revoked ones out", () => {
    expect(visibleAgents([agent("Zed"), agent("Ada"), agent("Old", true)]).map((a) => a.name)).toEqual(["Ada", "Zed"]);
  });
  it("says how much of the person's work is Live", () => {
    expect(liveWorkLine(0)).toBe("No issues Live yet");
    expect(liveWorkLine(1)).toBe("1 issue Live");
    expect(liveWorkLine(12)).toBe("12 issues Live");
  });
});
