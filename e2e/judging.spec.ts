import { expect, test, PROJECT } from "./fixtures";
import { e2eDb } from "./db";
import { authFile, emailFor, type Role, type Width } from "./users";
import type { Browser, Page } from "@playwright/test";

async function createWorkingAgent(
  prisma: ReturnType<typeof e2eDb>,
  tenantId: string,
  role: Role,
  width: Width,
  name: string,
  createdAt = new Date(),
) {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: emailFor(role, width) },
    select: { id: true },
  });
  return prisma.agent.create({
    data: { tenantId, ownerUserId: owner.id, name, level: "working", createdAt },
    select: { id: true, ownerUserId: true },
  });
}

async function prepareDelivery(
  title: string,
  width: Width,
  holderRole: Role,
  judgeRoles: Role[],
) {
  const prisma = e2eDb();
  try {
    const reporter = await prisma.user.findUniqueOrThrow({
      where: { email: emailFor("user", width) },
      select: { id: true },
    });
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: "project_zedu" },
      select: { id: true, tenantId: true, slug: true },
    });
    const bug = await prisma.bug.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        title,
        description: "Steps: open the page and click Save. Expected it to save; it shows a blank page.",
        reporterId: reporter.id,
        beneficiaryUserId: reporter.id,
        watches: { create: { userId: reporter.id } },
        status: "done",
        substatus: "requires_review",
      },
      select: { id: true, tenantId: true, number: true },
    });
    const holder = await createWorkingAgent(prisma, bug.tenantId, holderRole, width, `${title} holder`);
    const holderOwner = await prisma.user.findUniqueOrThrow({
      where: { email: emailFor(holderRole, width) },
      select: { id: true },
    });
    await prisma.issueClaim.create({
      data: {
        bugId: bug.id,
        agentId: holder.id,
        beneficiaryUserId: holderOwner.id,
        claimedAt: new Date(),
      },
    });
    await prisma.delivery.create({
      data: {
        bugId: bug.id,
        agentId: holder.id,
        beneficiaryUserId: holderOwner.id,
        summary: "Fixed the reported save failure.",
        description: "The delivered change preserves the pending request state.",
        pullRequestUrl: "https://github.com/example/project/pull/42",
        testResults: "2 passed",
      },
    });
    for (const [index, role] of judgeRoles.entries()) {
      await createWorkingAgent(
        prisma,
        bug.tenantId,
        role,
        width,
        `${title} judge ${index + 1}`,
        new Date(Date.now() + 1_000 + index),
      );
    }
    return `${PROJECT}/${bug.number}/judge`;
  } finally {
    await prisma.$disconnect();
  }
}

async function completeChecks(page: Page) {
  for (const label of [
    "I reproduced the issue on main.",
    "The fix works on the delivered branch.",
    "I checked nearby behaviour for regressions.",
    "The delivered proof matches what I saw.",
  ]) {
    await page.getByLabel(label).check();
  }
}

async function approve(page: Page, evidenceUrl: string) {
  await completeChecks(page);
  await page.getByLabel("HTTP or HTTPS URL").fill(evidenceUrl);
  await page.getByRole("button", { name: "Approve for merge" }).click();
}

test.describe("Judge Workbench", () => {
  test("blocks the claim holder from judging their own delivery", async ({ page, width, uniq }) => {
    const judgeUrl = await prepareDelivery(
      uniq("Claim holder judgement blocked"),
      width,
      "user",
      [],
    );

    await page.goto(judgeUrl);
    await expect(page.getByLabel("Ziki agent key")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("cannot judge it");
  });

  test("blocks another working agent owned by the claim holder", async ({ page, width, uniq }) => {
    const judgeUrl = await prepareDelivery(
      uniq("Same owner judgement blocked"),
      width,
      "user",
      ["user"],
    );

    await page.goto(judgeUrl);
    await expect(page.getByRole("status")).toContainText("You own the delivery");
  });

  test("rejects approval without evidence", async ({ page, width, uniq }) => {
    const judgeUrl = await prepareDelivery(
      uniq("Approval evidence required"),
      width,
      "admin",
      ["user"],
    );

    await page.goto(judgeUrl);
    await expect(page.getByRole("heading", { name: "Your verdict" })).toBeVisible();
    await completeChecks(page);
    await page.getByRole("button", { name: "Approve for merge" }).click();
    await expect(page.getByText("Add at least one evidence link before approving.")).toBeVisible();
  });

  test("moves the issue to Done · Requires review after two independent approvals", async ({ page, browser, width, uniq }) => {
    test.setTimeout(240_000);
    const title = uniq("Independent approvals");
    const judgeUrl = await prepareDelivery(title, width, "admin", ["user", "super"]);
    await page.goto(judgeUrl);
    await expect(page.getByRole("heading", { name: "Your verdict" })).toBeVisible({ timeout: 60_000 });
    await approve(page, "https://example.test/first-results");
    await expect(page.getByText("1 of 2 approvals")).toBeVisible({ timeout: 60_000 });

    const secondContext = await newJudgeContext(browser, width);
    try {
      const secondPage = await secondContext.newPage();
      await secondPage.goto(judgeUrl);
      await expect(secondPage.getByRole("heading", { name: "Your verdict" })).toBeVisible({ timeout: 60_000 });
      await expect(secondPage.getByText("Other verdicts stay hidden until you submit or judging closes.")).toBeVisible({ timeout: 60_000 });
      await approve(secondPage, "https://example.test/second-results");
      await expect(secondPage.getByRole("heading", { name: "Judging passed" })).toBeVisible({ timeout: 60_000 });
      await expect(secondPage.getByText("Done · Requires review.")).toBeVisible({ timeout: 60_000 });
      await expect(secondPage.getByText("2 approvals · 0 send-backs")).toBeVisible({ timeout: 60_000 });

      const issueNumber = Number(new URL(judgeUrl, "http://localhost").pathname.split("/").at(-2));
      const prisma = e2eDb();
      try {
        const bug = await prisma.bug.findFirstOrThrow({
          where: { number: issueNumber, title },
          select: { status: true, substatus: true },
        });
        expect(bug).toMatchObject({ status: "done", substatus: "requires_review" });
      } finally {
        await prisma.$disconnect();
      }
    } finally {
      await secondContext.close();
    }
  });
});

async function newJudgeContext(browser: Browser, width: Width) {
  return browser.newContext({ storageState: authFile("super", width) });
}
