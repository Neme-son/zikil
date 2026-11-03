import { expect, type Page } from "@playwright/test";
import { fileIssue, test, PROJECT } from "./fixtures";

/**
 * #1070: at tablet widths the header's project, key, nav and account menu
 * needed about 940px, so every page scrolled sideways at 768px. No page may
 * be wider than the window at any of these widths.
 */
const WIDTHS = [360, 768, 1024, 1280];

async function expectNoSidewaysScroll(page: Page) {
  const { scrollWidth, innerWidth, overflowers } = await page.evaluate(() => {
    const overflowers = [...document.body.querySelectorAll<HTMLElement>("*")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((element) => element.right > window.innerWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 8);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      overflowers,
    };
  });
  expect(
    scrollWidth,
    `page is ${scrollWidth}px wide in a ${innerWidth}px window; overflowing elements: ${JSON.stringify(overflowers)}`,
  ).toBeLessThanOrEqual(innerWidth);
}

test.describe("no sideways scroll", () => {
  test.use({ as: "user" });

  test("expanded code stays inside the issue description on desktop and mobile", async ({ page, uniq }) => {
    const title = uniq("Expanded fenced code stays in its card");
    const longCodeLine = `const value = "${"x".repeat(1800)}";`;
    const description = [
      "This issue tests a long fenced line after the description expands.",
      "The description starts with enough text to show the expansion control.",
      "The code must remain in the description card beside the issue side rail.",
      "Long code lines should scroll inside the code block.",
      "This text keeps the code below the collapsed preview.",
      "The next section contains the long line.",
      "```ts",
      longCodeLine,
      "```",
    ].join("\n");
    await fileIssue(page, title, description);

    const descriptionCard = page.getByRole("region", { name: "Description" });
    await descriptionCard.getByRole("button", { name: "View more" }).click();
    const codeBlock = descriptionCard.getByRole("group", { name: "Code block" });

    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(codeBlock).toBeVisible();
      const bounds = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('[aria-label="Description"]');
        const code = card?.querySelector<HTMLElement>("pre[aria-label='Code block']");
        if (!card || !code) throw new Error("Expanded description code block was not found");
        return {
          cardRight: card.getBoundingClientRect().right,
          codeRight: code.getBoundingClientRect().right,
          codeClientWidth: code.clientWidth,
          codeScrollWidth: code.scrollWidth,
        };
      });
      expect(bounds.codeRight, `code block escaped the card at ${width}px`).toBeLessThanOrEqual(bounds.cardRight + 1);
      expect(bounds.codeScrollWidth, `code line did not scroll inside its block at ${width}px`).toBeGreaterThan(bounds.codeClientWidth);
      await expectNoSidewaysScroll(page);
    }
  });

  for (const width of WIDTHS) {
    test(`the issue list and an issue page at ${width}px`, async ({ page, uniq }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${PROJECT}/issues/open`);
      await expectNoSidewaysScroll(page);

      await fileIssue(page, uniq("Layout target"));
      await expectNoSidewaysScroll(page);

      await page.goto("/inbox?tab=escalations");
      await expectNoSidewaysScroll(page);
    });
  }

  test("the top bar navigation stays on the page at phone and desktop widths", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(`${PROJECT}/issues/open`);
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  });
});
