import { describe, expect, it } from "vitest";
import {
  autoEntryNote,
  capSessionMinutes,
  formatDuration,
  isValidMinutes,
  MAX_AUTO_SESSION_MINUTES,
  MAX_TIME_ENTRY_MINUTES,
  parseMinutesInput,
  sumMinutes,
} from "@/lib/time-tracking";

describe("time tracking", () => {
  it("formats a duration in hours and minutes", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(1440)).toBe("24h");
  });

  it("accepts only whole minutes in range", () => {
    expect(isValidMinutes(1)).toBe(true);
    expect(isValidMinutes(MAX_TIME_ENTRY_MINUTES)).toBe(true);
    expect(isValidMinutes(0)).toBe(false);
    expect(isValidMinutes(MAX_TIME_ENTRY_MINUTES + 1)).toBe(false);
    expect(isValidMinutes(1.5)).toBe(false);
  });

  it("caps auto-tracked sessions to avoid inflated time", () => {
    expect(capSessionMinutes(30)).toBe(30);
    expect(capSessionMinutes(MAX_AUTO_SESSION_MINUTES)).toBe(MAX_AUTO_SESSION_MINUTES);
    expect(capSessionMinutes(MAX_AUTO_SESSION_MINUTES + 1000)).toBe(MAX_AUTO_SESSION_MINUTES);
    expect(capSessionMinutes(-5)).toBe(0);
  });

  it("formats auto-entry notes with active vs total", () => {
    expect(autoEntryNote(45, 72)).toBe("Auto-tracked: 45m active of 1h 12m total");
    expect(autoEntryNote(60, 60)).toBe("Auto-tracked: 1h");
    expect(autoEntryNote(0, 60)).toBe("Auto-tracked: 1h");
  });

  it("sums the entries into the issue total", () => {
    expect(sumMinutes([])).toBe(0);
    expect(sumMinutes([{ minutes: 30 }, { minutes: 90 }])).toBe(120);
  });

  it("still parses manual input for admin corrections", () => {
    expect(parseMinutesInput("30")).toBe(30);
    expect(parseMinutesInput("abc")).toBeNull();
  });
});
