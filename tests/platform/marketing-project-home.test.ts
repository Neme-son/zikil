import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { isMarketingProject, projectHomePath } from "@/lib/marketing/project-home";
import { projectRef } from "@/lib/project-paths";

/** A fake db whose project has the given tracks of work. */
function dbWith(tracks: string[]) {
  const findFirst = vi.fn(async ({ where }: { where: { track: string } }) => (tracks.includes(where.track) ? { id: "bug" } : null));
  return { bug: { findFirst } } as never;
}

/** Where a project opens (#marketing-home): an all-marketing project opens on its Marketing tab. */
describe("project home (#marketing-home)", () => {
  const ref = projectRef("ziki", "ziki-marketing");

  it("opens an all-marketing project on its Marketing tab", async () => {
    expect(await isMarketingProject(dbWith(["marketing"]), "p")).toBe(true);
    expect(await projectHomePath(dbWith(["marketing"]), "p", ref)).toBe("/ziki/ziki-marketing/marketing");
  });

  it("keeps product projects, mixed ones and empty ones on Ideas", async () => {
    for (const tracks of [["product"], ["product", "marketing"], []]) {
      expect(await isMarketingProject(dbWith(tracks), "p")).toBe(false);
      expect(await projectHomePath(dbWith(tracks), "p", ref)).toBe("/ziki/ziki-marketing/ideas");
    }
  });
});
