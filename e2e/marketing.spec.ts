import { createHash, randomBytes } from "node:crypto";
import { type Browser, type Page } from "@playwright/test";
import { PrismaClient, type AgentLevel } from "@prisma/client";
import { authFile, emailFor, type Role, type Width } from "./users";
import { test, expect, PROJECT } from "./fixtures";
import { calculateReporterPoints, calculateReviewerPoints, parseProjectRewardConfig, solverReward } from "@/lib/points/project-rewards";
import { hardCodedPlatformRewards, parsePlatformRewardConfig } from "@/lib/points/platform-reward-config";
import { reviewerPointsAt } from "@/lib/points/rules";

type AgentIdentity = { id: string; key: string; ownerId: string };
type LifecycleAgents = { worker: AgentIdentity; manager: AgentIdentity; reviewerManager: AgentIdentity; reviewerWorker: AgentIdentity };

function assertE2EDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL must point to the dedicated E2E database.");
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || database !== "ziki_marketing_e2e") {
    throw new Error(`Refusing Marketing E2E access to ${url.hostname}/${database}; expected localhost/ziki_marketing_e2e.`);
  }
}

async function provisionAgent(
  db: PrismaClient,
  ownerId: string,
  name: string,
  level: AgentLevel,
  organisationId: string,
  tagId: string,
): Promise<AgentIdentity> {
  const key = `ziki_${randomBytes(32).toString("base64url")}`;
  const created = await db.agent.create({
    data: {
      ownerUserId: ownerId,
      name,
      tagline: "Writes and reviews Marketing deliverables for E2E coverage.",
      about: "A seeded test agent used only to exercise the Marketing lifecycle.",
      skills: { create: { tagId, summary: "Marketing lifecycle test", description: "Exercises the actual Ziki agent workflow." } },
      activations: { create: { organisationId, level } },
      apiKeys: {
        create: {
          organisationId,
          keyHash: createHash("sha256").update(key).digest("hex"),
          prefix: key.slice(0, 11),
        },
      },
    },
    select: { id: true },
  });
  return { id: created.id, key, ownerId };
}

async function authenticatedPost(page: Page, key: string, path: string, data: unknown) {
  return page.request.post(path, { headers: { Authorization: `Bearer ${key}` }, data });
}

async function signInAs(browser: Browser, role: Role, width: Width) {
  const context = await browser.newContext({ storageState: authFile(role, width) });
  return { context, page: await context.newPage() };
}

async function castGoodVerdict(page: Page, ideaUrl: string, summary: string) {
  await page.goto(ideaUrl);
  const form = page.getByRole("form", { name: "Your verdict" });
  await form.getByLabel("Good", { exact: true }).check();
  await form.getByLabel("Summary").fill(summary);
  await form.getByLabel("Description").fill("This is a useful, focused Marketing task for the current project.");
  await form.getByRole("button", { name: "Give verdict" }).click();
  await expect(form.getByRole("status")).toContainText("saved");
}

test("Marketing task runs from proposal to Live · Published with idempotent points", async ({ browser, page, width, uniq }) => {
  test.skip(width !== "desktop", "This lifecycle uses a single shared set of seeded people and runs once.");
  assertE2EDatabase();

  const db = new PrismaClient();
  const contexts: Awaited<ReturnType<typeof signInAs>>[] = [];
  try {
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: "organisation_zedu" }, select: { id: true } });
    const project = await db.project.findUniqueOrThrow({ where: { id: "project_zedu" }, select: { id: true, organisationId: true } });
    const type = await db.issueType.findFirstOrThrow({ where: { organisationId: organisation.id, name: "Marketing" }, select: { id: true } });
    // The shared E2E seed creates general issue types with the product default;
    // the Marketing form correctly lists only types explicitly marked marketing.
    await db.issueType.update({ where: { id: type.id }, data: { track: "marketing" } });

    const people = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: emailFor("user", "desktop") }, select: { id: true } }),
      db.user.findUniqueOrThrow({ where: { email: emailFor("admin", "desktop") }, select: { id: true } }),
      db.user.findUniqueOrThrow({ where: { email: emailFor("super", "desktop") }, select: { id: true } }),
      db.user.findUniqueOrThrow({ where: { email: emailFor("user", "mobile") }, select: { id: true } }),
      db.user.findUniqueOrThrow({ where: { email: emailFor("admin", "mobile") }, select: { id: true } }),
    ]);
    const tag = await db.skillTag.upsert({
      where: { organisationId_slug: { organisationId: organisation.id, slug: "marketing-e2e" } },
      create: { organisationId: organisation.id, name: "Marketing E2E", slug: "marketing-e2e" },
      update: {},
      select: { id: true },
    });
    const agents: LifecycleAgents = {
      worker: await provisionAgent(db, people[1].id, "Marketing lifecycle worker", "working", organisation.id, tag.id),
      manager: await provisionAgent(db, people[2].id, "Marketing lifecycle manager", "manager", organisation.id, tag.id),
      reviewerManager: await provisionAgent(db, people[3].id, "Marketing lifecycle manager reviewer", "manager", organisation.id, tag.id),
      reviewerWorker: await provisionAgent(db, people[4].id, "Marketing lifecycle worker reviewer", "working", organisation.id, tag.id),
    };

    // Mistake-registry consultation is a read through the documented agent API.
    const registry = await page.request.get(`/api/v1/projects/${project.id}/mistakes`, {
      headers: { Authorization: `Bearer ${agents.manager.key}` },
    });
    expect(registry.status(), "the project's mistake registry should be readable before lifecycle work").toBe(200);

    const proposer = await signInAs(browser, "user", "desktop");
    const worker = await signInAs(browser, "admin", "desktop");
    const manager = await signInAs(browser, "super", "desktop");
    const managerReviewer = await signInAs(browser, "user", "mobile");
    const workerReviewer = await signInAs(browser, "admin", "mobile");
    contexts.push(proposer, worker, manager, managerReviewer, workerReviewer);

    const title = uniq("Marketing lifecycle Playwright task");
    await proposer.page.goto(`${PROJECT}/marketing/tasks/new`);
    await proposer.page.getByLabel("Title").fill(title);
    await proposer.page.getByLabel("Task type").selectOption(type.id);
    await proposer.page.getByLabel("Rationale").fill("A concise product update helps current users discover the new workflow.");
    await proposer.page.locator("#description").fill("Write a short release note for current Ziki users, explain the change, and include a clear call to action.");
    await proposer.page.getByRole("button", { name: "Propose task" }).click();
    await expect(proposer.page).toHaveURL(/\/ideas\/\d+$/);
    const ideaUrl = proposer.page.url();
    const ideaNumber = Number(new URL(ideaUrl).pathname.split("/").pop());

    await castGoodVerdict(proposer.page, ideaUrl, "The audience and outcome are clear.");
    await castGoodVerdict(manager.page, ideaUrl, "This supports the current product focus.");
    await castGoodVerdict(managerReviewer.page, ideaUrl, "The task is appropriately scoped.");

    const idea = await db.idea.findFirstOrThrow({ where: { number: ideaNumber, title }, select: { id: true, issueId: true, reporterId: true, track: true, rationale: true, typeId: true } });
    expect(idea).toMatchObject({ reporterId: people[0].id, track: "marketing", rationale: "A concise product update helps current users discover the new workflow.", typeId: type.id });
    expect(idea.issueId).toBeTruthy();
    const bug = await db.bug.findUniqueOrThrow({ where: { id: idea.issueId! }, select: { id: true, number: true, projectId: true, status: true, substatus: true, track: true, reporterId: true, reward: true, pullRequestUrl: true } });
    expect(bug).toMatchObject({ projectId: project.id, status: "open", substatus: "open", track: "marketing", reporterId: people[0].id, pullRequestUrl: null });

    await worker.page.goto(`${PROJECT}/${bug.number}`);
    await expect(worker.page.getByRole("heading", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeVisible();
    await expect(worker.page.getByText("Open", { exact: true })).toBeVisible();
    await worker.page.getByRole("tab", { name: /Bids & Award/ }).click();
    await worker.page.getByRole("button", { name: "Bid", exact: true }).click();
    await worker.page.getByRole("dialog").getByLabel("Agent").selectOption(agents.worker.id);
    await worker.page.getByRole("dialog").getByLabel(/Comment/).fill("I will write, edit and proofread the release note.");
    await worker.page.getByRole("dialog").getByRole("button", { name: "Place bid" }).click();
    const bidRow = worker.page.locator("[data-testid='bids'] li").filter({ hasText: "Marketing lifecycle worker" });
    await expect(bidRow).toBeVisible();

    await manager.page.goto(`${PROJECT}/${bug.number}`);
    await manager.page.getByRole("tab", { name: /Bids & Award/ }).click();
    const managerBid = manager.page.locator("[data-testid='bids'] li").filter({ hasText: "Marketing lifecycle worker" });
    await expect(managerBid).toBeVisible();
    await managerBid.getByRole("button", { name: "Award" }).click();
    await expect(manager.page.getByText("Offered", { exact: true })).toBeVisible();

    const offer = await db.issueClaim.findFirstOrThrow({ where: { bugId: bug.id, agentId: agents.worker.id, status: "offered", releasedAt: null }, select: { id: true } });
    const acceptedOffer = await authenticatedPost(manager.page, agents.worker.key, `/api/v1/offers/${offer.id}/accept`, {});
    expect(acceptedOffer.ok(), await acceptedOffer.text()).toBeTruthy();
    await worker.page.reload();
    await expect(worker.page.getByTestId("award-box")).toContainText("Awarded to Marketing lifecycle worker");
    await expect(worker.page.getByTestId("award-box")).toContainText("For Ada Admin D");

    const deliveryResponse = await authenticatedPost(worker.page, agents.worker.key, `/api/v1/issues/${bug.id}/delivery`, {
      summary: "Published the release note.",
      description: "Wrote and proofread the short update for existing users.",
      deliverableText: "# What changed\n\nThe issue list now makes the next step clearer. Open a task to see its full workflow.",
    });
    const deliveryResponseText = await deliveryResponse.text();
    expect(deliveryResponse.status(), deliveryResponseText).toBe(201);
    const deliveryBody = JSON.parse(deliveryResponseText) as { delivery: { pullRequestUrl: string | null } };
    expect(deliveryBody.delivery.pullRequestUrl).toBeNull();
    await worker.page.reload();
    await worker.page.getByRole("tab", { name: /Deliverables/ }).click();
    await expect(worker.page.getByTestId("marketing-deliverables")).toContainText("Published the release note.");
    await expect(worker.page.getByTestId("marketing-deliverables")).toContainText("The issue list now makes the next step clearer.");

    for (const reviewer of [agents.reviewerManager, agents.reviewerWorker]) {
      const judged = await authenticatedPost(manager.page, reviewer.key, `/api/v1/issues/${bug.id}/test-results`, {
        goodToMerge: true,
        summary: "The deliverable is ready.",
        description: "Reviewed the text for clarity, audience and the requested call to action.",
        files: [{ path: "Marketing deliverable", lines: "1-3" }],
      });
      expect(judged.ok(), await judged.text()).toBeTruthy();
    }
    const repeatedJudgement = await authenticatedPost(manager.page, agents.reviewerManager.key, `/api/v1/issues/${bug.id}/test-results`, {
      goodToMerge: true,
      summary: "The deliverable is ready.",
      description: "Reviewed the text again; the prior judgement is being replaced, not duplicated.",
      files: [{ path: "Marketing deliverable", lines: "1-3" }],
    });
    expect(repeatedJudgement.status(), await repeatedJudgement.text()).toBe(200);
    await manager.page.reload();
    await expect(manager.page.getByText(/Done\s*·\s*Accepted|Accepted/i).first()).toBeVisible();

    const accepted = await authenticatedPost(manager.page, agents.manager.key, `/api/v1/issues/${bug.id}/merge`, {
      verdict: "accept",
      summary: "Accepted the published deliverable.",
      description: "The copy is clear, complete and ready to publish.",
    });
    expect(accepted.ok(), await accepted.text()).toBeTruthy();
    await manager.page.reload();
    await expect(manager.page.getByRole("heading", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeVisible();
    await expect(manager.page.getByText("Live (Published)", { exact: true })).toBeVisible();
    await expect.poll(async () => db.bug.findUniqueOrThrow({ where: { id: bug.id }, select: { status: true, substatus: true } })).toEqual({ status: "resolved", substatus: "published" });

    const readAwards = () => db.pointEntry.findMany({
      where: { bugId: bug.id, role: { in: ["reporter", "solver", "dispatcher", "reviewer"] } },
      select: { userId: true, role: true, points: true, sourceKey: true },
      orderBy: { role: "asc" },
    });
    const awards = await readAwards();
    const projectRow = await db.project.findUniqueOrThrow({ where: { id: project.id }, select: { rewardConfig: true } });
    const platform = await db.platformSettings.findUnique({ where: { id: "default" }, select: { rewardConfig: true } });
    const effectivePlatform = platform ? parsePlatformRewardConfig(platform.rewardConfig) : hardCodedPlatformRewards();
    const effectiveProject = parseProjectRewardConfig(projectRow.rewardConfig, {
      reporter: effectivePlatform.reporter,
      reviewer: effectivePlatform.reviewer,
      guidelines: effectivePlatform.guidelines,
    });
    const reporterPoints = calculateReporterPoints(effectiveProject);
    const reviewerBase = calculateReviewerPoints(effectiveProject);
    const dispatcherPoints = effectivePlatform.dispatcher;
    const verdictOrder = await db.testVerdict.findMany({
      where: { bugId: bug.id, goodToMerge: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { agent: { select: { ownerUserId: true } } },
    });
    expect(awards).toHaveLength(5);
    expect(awards.filter((entry) => entry.role === "reporter").map((entry) => [entry.userId, Number(entry.points)])).toEqual([[people[0].id, reporterPoints]]);
    expect(awards.filter((entry) => entry.role === "solver").map((entry) => [entry.userId, Number(entry.points)])).toEqual([[people[1].id, solverReward(bug.reward)]]);
    expect(awards.filter((entry) => entry.role === "dispatcher").map((entry) => [entry.userId, Number(entry.points)])).toEqual([[people[2].id, dispatcherPoints]]);
    expect(awards.filter((entry) => entry.role === "reviewer").map((entry) => [entry.userId, Number(entry.points)]).sort(([a], [b]) => String(a).localeCompare(String(b)))).toEqual(
      verdictOrder.map((verdict, index) => [verdict.agent.ownerUserId, reviewerPointsAt(index, reviewerBase)]).sort(([a], [b]) => String(a).localeCompare(String(b))),
    );
    expect(new Set(awards.map((entry) => entry.sourceKey)).size).toBe(awards.length);

    const duplicateReview = await authenticatedPost(manager.page, agents.manager.key, `/api/v1/issues/${bug.id}/merge`, {
      verdict: "accept",
      summary: "Repeated acceptance request.",
      description: "This request must not pay the work twice.",
    });
    expect(duplicateReview.ok()).toBeFalsy();
    await manager.page.reload();
    await expect(manager.page.getByText("Live (Published)", { exact: true })).toBeVisible();
    expect(await readAwards()).toHaveLength(5);
  } finally {
    await Promise.all(contexts.map(({ context }) => context.close()));
    await db.$disconnect();
  }
});
