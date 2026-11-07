import { describe, expect, it } from "vitest";
import { groupReleases, releaseDay, releaseWhere, type ReleaseRow } from "@/lib/releases";

/** Release notes group Live issues by the day they went in, newest first (#872). */
const row = (number: number, at: string, substatus = "on_dev"): ReleaseRow => ({
  id: `b${number}`, number, title: `Issue ${number}`, substatus, typeName: null, pullRequestUrl: null, at: new Date(at),
});

describe("releases", () => {
  it("files an issue under its UTC day", () => {
    expect(releaseDay(new Date("2026-11-07T23:59:59Z"))).toBe("2026-11-07");
    expect(releaseDay(new Date("2026-11-08T00:00:00Z"))).toBe("2026-11-08");
  });
  it("groups newest day first and newest first within a day, ties by issue number", () => {
    const days = groupReleases([
      row(1, "2026-11-06T10:00:00Z"),
      row(2, "2026-11-07T09:00:00Z"),
      row(3, "2026-11-07T15:00:00Z"),
      row(4, "2026-11-07T15:00:00Z"),
    ]);
    expect(days.map((d) => d.day)).toEqual(["2026-11-07", "2026-11-06"]);
    expect(days[0].items.map((i) => i.number)).toEqual([4, 3, 2]);
  });
  it("is empty when nothing is Live", () => {
    expect(groupReleases([])).toEqual([]);
  });
  it("says where an issue is deployed", () => {
    expect(releaseWhere("on_dev")).toBe("On dev");
    expect(releaseWhere("on_staging")).toBe("On staging");
    expect(releaseWhere("on_prod")).toBe("On prod");
    expect(releaseWhere("other")).toBe("Live");
  });
});
