/**
 * Local scenario (#deeper-testing): two delivered issues on Triage's Web project.
 *
 * - "Composer hides behind the sidebar" stays at Done · Requires review: four
 *   judgements, one with full proof (counts), one bare "LGTM" (doesn't count),
 *   one with part of its proof that rates the card too easy, and one that
 *   proves a square fails, which holds it; one row waits on the deliverer's
 *   CI test and one on the owners (Waive / File it as an idea, and Set it aside
 *   on the failed square, for an owner or admin).
 * - "Saving settings shows no confirmation" reaches Done · Accepted: three
 *   judgements, each with proof for every square on its card.
 *
 * Together they show the test card, the judgement labels and proof lists, the
 * checklist line and the Tests bar on Issues › Delivered. Proof screenshots
 * are drawn with Playwright's Chromium (set PLAYWRIGHT_CHROMIUM to its path if
 * the bundled one isn't installed).
 *
 *   pnpm db:scenario:deeper-testing
 *
 * The card follows Triage's own checks (Org › Checks); with none, the scenario
 * adds one rule for every issue (Works on the PR, On a phone) so there is a card.
 * Additive only: it never resets or reseeds. Its rows have fixed ids (`scn-dt-*`)
 * and emails (`*@scenario.local`); a rerun deletes and recreates just its own
 * issue. It refuses to run against anything but a local database.
 */
import { PrismaClient } from "@prisma/client";
import { checksFor, loadProofRules } from "@/lib/proof";
import { refreshJudgedStatus } from "@/lib/agent-api/tested-status";

const ORGANISATION_SLUG = "triage";
const PROJECT_SLUG = "web";
const P = "scn-dt";
const SHA = "a3f9c21d4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c";
const PR = "https://github.com/triage/web/pull/1197";
const MIN = 60_000;

function assertLocalDatabase(url: string | undefined): void {
  if (!url) throw new Error("DATABASE_URL is not set.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error(`Refusing to write a scenario to a non-local database (${host}).`);
}

/** The deliverer, then the four testers, each with an owner. */
const PEOPLE = [
  { key: "bob", name: "Bob Builder", agent: "Forge" },
  { key: "kemi", name: "Kemi", agent: "Kestrel" },
  { key: "dami", name: "Dami O.", agent: "Fern" },
  { key: "chen", name: "Chen Q.", agent: "Juniper" },
  { key: "ivy", name: "Ivy's owner", agent: "Ivy" },
] as const;
type Key = (typeof PEOPLE)[number]["key"];
const userId = (key: Key) => `${P}-user-${key}`;
const agentId = (key: Key) => `${P}-agent-${key}`;

/**
 * What each tester saw, drawn as a small labelled mock-up (this is a scenario:
 * there is no real app behind it), so every proof file shows what its entry
 * says. Rendered with the local Playwright Chromium.
 */
type Shot = { width: number; sidebarOpen: boolean; composerOnTop: boolean; note: string; keyboard?: boolean; draft?: string };
function screen(shot: Shot): string {
  const phone = shot.width < 500;
  return `<body style="margin:0;font:14px system-ui;background:#f4f4f6">
  <div style="position:relative;width:${shot.width}px;height:${phone ? 640 : 480}px;overflow:hidden;background:#fff;border:1px solid #ccc">
    <div style="padding:10px 14px;background:#1d1d27;color:#fff;font-weight:700">#general</div>
    <div style="padding:12px 14px;color:#444">Ada: shipping the fix today<br><br>Bob: great, I'll test on my phone</div>
    ${shot.sidebarOpen ? `<div style="position:absolute;top:0;left:0;bottom:0;width:${phone ? 260 : 220}px;background:#2b2b3a;color:#ddd;padding:14px;z-index:${shot.composerOnTop ? 1 : 3}"><b>Channels</b><br><br># general<br># design<br># releases</div>` : ""}
    <div style="position:absolute;left:0;right:0;bottom:${shot.keyboard ? 230 : 0}px;padding:10px;background:#fff;border-top:2px solid #6c5ce7;z-index:2;display:flex;gap:8px">
      <div style="flex:1;border:1px solid #aaa;border-radius:8px;padding:8px;color:#222">${shot.draft ?? "Message #general"}</div><div style="background:#6c5ce7;color:#fff;border-radius:8px;padding:8px 12px">Send</div>
    </div>
    ${shot.keyboard ? `<div style="position:absolute;left:0;right:0;bottom:0;height:230px;background:#d1d3d9;display:grid;place-items:center;color:#555">on-screen keyboard</div>` : ""}
  </div>
  <div style="padding:6px 8px;font:12px monospace;color:#333">${shot.width}px · sidebar ${shot.sidebarOpen ? "open" : "closed"} · ${shot.note} · scenario mock-up</div></body>`;
}
async function render(shots: Shot[]): Promise<Buffer[]> {
  const { chromium } = await import("@playwright/test");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM ?? undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const out: Buffer[] = [];
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.width + 2, height: (shot.width < 500 ? 640 : 480) + 30 } });
      await page.setContent(screen(shot));
      out.push(await page.screenshot({ fullPage: true }));
      await page.close();
    }
    return out;
  } finally {
    await browser.close();
  }
}

const TEST_LOG = (passing: boolean) => `$ pnpm vitest run tests/chat/composer-stacking.test.ts
 RUN  v5.0.5 /repo/apps/web

 ${passing ? "✓" : "×"} composer stays above the open sidebar under 400px
 ${passing ? "✓" : "×"} composer keeps its draft when the sidebar opens
${passing ? "" : "\n AssertionError: expected z-index 1 to be greater than 3 (sidebar)\n   at tests/chat/composer-stacking.test.ts:18:32\n"}
 Test Files  ${passing ? "1 passed" : "1 failed"} (1)
      Tests  ${passing ? "2 passed" : "2 failed"} (2)
 commit ${passing ? "a3f9c21 (with the fix)" : "e81b004 (before the fix)"}
`;

async function main() {
  assertLocalDatabase(process.env.DATABASE_URL);
  const db = new PrismaClient();
  try {
    const organisation = await db.organisation.findUnique({ where: { slug: ORGANISATION_SLUG }, select: { id: true } });
    if (!organisation) throw new Error(`No "${ORGANISATION_SLUG}" organisation in this database.`);
    const project = await db.project.findUnique({ where: { organisationId_slug: { organisationId: organisation.id, slug: PROJECT_SLUG } }, select: { id: true } });
    if (!project) throw new Error(`No "${PROJECT_SLUG}" project in "${ORGANISATION_SLUG}".`);
    const now = Date.now();
    const at = (ago: number) => new Date(now - ago);

    for (const person of PEOPLE) {
      await db.user.upsert({ where: { id: userId(person.key) }, create: { id: userId(person.key), name: person.name, email: `${P}-${person.key}@scenario.local` }, update: { name: person.name } });
      await db.membership.upsert({
        where: { organisationId_userId: { organisationId: organisation.id, userId: userId(person.key) } },
        create: { organisationId: organisation.id, userId: userId(person.key), role: "member" },
        update: {},
      });
      await db.agent.upsert({
        where: { id: agentId(person.key) },
        create: { id: agentId(person.key), ownerUserId: userId(person.key), name: person.agent, activations: { create: { organisationId: organisation.id, level: "working" } } },
        update: { name: person.agent, revokedAt: null },
      });
    }

    // A card needs checks: use Triage's own, or add one rule if it has none.
    if (!(await db.proofRule.count({ where: { organisationId: organisation.id } }))) {
      await db.proofRule.create({ data: { id: `${P}-rule`, organisationId: organisation.id, checks: ["fixed", "phone"] } });
    }
    const fixType = await db.issueType.findFirst({ where: { organisationId: organisation.id, name: "Fix" }, select: { id: true } });

    // Start over: the issue cascades to its claim, delivery, rows, judgements and attachments.
    await db.bug.deleteMany({ where: { id: { in: [`${P}-issue`, `${P}-issue-accepted`] } } });
    const issue = await db.bug.create({
      data: {
        id: `${P}-issue`,
        title: "Composer hides behind the sidebar on phones",
        summary: "On screens under 400px the message composer slides under the open sidebar, so you can't type a reply.",
        description: "## Acceptance criteria\n- The composer stays above the open sidebar.\n- You can type and send a reply with the sidebar open.",
        status: "done",
        substatus: "requires_review",
        priority: "high",
        organisationId: organisation.id,
        projectId: project.id,
        typeId: fixType?.id ?? null,
        reporterId: userId("chen"),
        beneficiaryUserId: userId("bob"),
        assigneeId: userId("bob"),
        pullRequestUrl: PR,
        pullRequestHeadSha: SHA,
        createdAt: at(3 * 24 * 60 * MIN),
      },
      select: { id: true, number: true, projectId: true, typeId: true, areaId: true },
    });
    await db.issueClaim.create({
      data: { bugId: issue.id, agentId: agentId("bob"), beneficiaryUserId: userId("bob"), status: "active", claimedAt: at(5 * 60 * MIN), lastHeartbeatAt: at(10 * MIN) },
    });
    await db.delivery.create({
      data: {
        bugId: issue.id,
        agentId: agentId("bob"),
        beneficiaryUserId: userId("bob"),
        summary: "Composer stays above the open sidebar on phones.",
        description: "Moved the composer into the sidebar's stacking context and gave it a fixed bottom offset under 400px.",
        pullRequestUrl: PR,
        headSha: SHA,
        receipt: {
          verified: [{ check: "Composer stacks above the sidebar", how: "read the CSS stacking on a3f9c21" }],
          notVerified: [{ check: "On a real phone browser", why: "checked in Chrome devtools at 375px only" }],
          reviewerShould: ["Rotate the phone with the sidebar open"],
        },
        createdAt: at(60 * MIN),
      },
    });

    // The card's rows the first tester added past the issue's own criteria (which the card reads from the description).
    const row = (id: string, data: object) => db.testCardRow.create({ data: { id: `${P}-row-${id}`, bugId: issue.id, agentId: agentId("kemi"), ...data } as never });
    await row("b1", { text: "On-screen keyboard open", source: "beyond", kind: "devices", envs: ["Phone 375px"], needsTwo: true, why: "The criteria never mention the keyboard, which covers half a phone screen." });
    await row("b2", { text: "Opening the sidebar mid-reply keeps the draft", source: "beyond", kind: "mid_change", envs: ["Phone 375px", "Desktop"], why: "The criteria cover the layout, not losing what you typed." });
    await row("b3", { text: "Two replies sent at once both arrive, once each", source: "beyond", kind: "two_at_once", proof: "test", route: "ci", routedAt: at(30 * MIN), why: "No screenshot can show a race." });
    await row("b4", { text: "20 replies in a minute are slowed down", source: "beyond", kind: "two_at_once", proof: "log", route: "env", routedAt: at(20 * MIN), why: "Needs request logs from staging, which testers don't have." });

    // Each tester's proof: a screenshot of what they saw, or a test run's output, uploaded and on this issue.
    const [phoneFixed, desktopFixed, phoneReply, keyboard, draftKept, draftLost, rotated] = await render([
      { width: 375, sidebarOpen: true, composerOnTop: true, note: "composer above the sidebar" },
      { width: 1280, sidebarOpen: true, composerOnTop: true, note: "composer above the sidebar" },
      { width: 375, sidebarOpen: true, composerOnTop: true, note: "reply typed with the sidebar open", draft: "On my way, sending now ✓" },
      { width: 375, sidebarOpen: true, composerOnTop: true, note: "keyboard open, composer still visible", keyboard: true, draft: "Typing with the keyboard up" },
      { width: 375, sidebarOpen: true, composerOnTop: true, note: "draft kept after opening the sidebar", draft: "Half-written reply…" },
      { width: 1280, sidebarOpen: true, composerOnTop: true, note: "draft LOST after opening the sidebar" },
      { width: 667, sidebarOpen: true, composerOnTop: true, note: "real phone, landscape" },
    ]);
    let uploads = 0;
    const upload = async (owner: Key, name: string, data: Buffer, contentType: string) => {
      const id = `${P}-att-${owner}-${++uploads}`;
      await db.attachment.create({ data: { id, uploaderId: userId(owner), bugId: issue.id, filename: name, contentType, size: data.length, data: new Uint8Array(data) } });
      return id;
    };
    const TEST = "apps/web/chat/composer-stacking.test.ts";
    const files = [{ path: "apps/web/chat/composer.tsx" }, { path: TEST }];
    const shot = async (owner: Key, name: string, data: Buffer, shows: string) => ({ result: "pass", attachmentId: await upload(owner, name, data, "image/png"), shows });
    // What each built-in check is proven with; a check the owners wrote gets the phone screenshot.
    const checkProof = async (owner: Key, id: string) =>
      id === "regression"
        ? { result: "pass", attachmentId: await upload(owner, "composer-stacking.log", Buffer.from(TEST_LOG(false) + "\n" + TEST_LOG(true)), "text/plain"), shows: "The new test fails on the commit before the fix and passes on a3f9c21.", test: TEST }
        : id === "fixed"
          ? await shot(owner, "fixed-desktop.png", desktopFixed, "On a3f9c21 the composer sits above the open sidebar on desktop.")
          : await shot(owner, `${id}-phone.png`, phoneFixed, "At 375px with the sidebar open, the composer stays on top and usable.");
    const { required } = checksFor(await loadProofRules(db, organisation.id), issue);
    const allChecks = async (owner: Key) => Object.fromEntries(await Promise.all(required.map(async (id) => [id, await checkProof(owner, id)] as const)));

    const verdict = (key: Key, goodToMerge: boolean, summary: string, proof: object | null, ago: number) =>
      db.testVerdict.create({
        data: {
          bugId: issue.id,
          agentId: agentId(key),
          onBehalfOfUserId: userId(key),
          goodToMerge,
          summary,
          description: summary,
          pullRequestUrl: PR,
          headSha: SHA,
          files,
          proof: proof ?? undefined,
          createdAt: at(ago),
          updatedAt: at(ago),
        },
      });
    await verdict(
      "kemi",
      true,
      "Good to merge: the composer stays above the sidebar on a phone and on desktop.",
      {
        checks: await allChecks("kemi"),
        squares: {
          "criteria:0": await shot("kemi", "composer-phone.png", phoneFixed, "Composer above the open sidebar at 375px."),
          "criteria:1": await shot("kemi", "reply-typed.png", phoneReply, "A reply typed and ready to send with the sidebar open."),
          "receipt:0": await shot("kemi", "real-phone-landscape.png", rotated, "On a real phone browser, in landscape."),
          [`${P}-row-b1@Phone 375px`]: await shot("kemi", "keyboard-open.png", keyboard, "With the keyboard up, the composer is still above it and visible."),
        },
      },
      40 * MIN,
    );
    await verdict("dami", true, "LGTM, works for me.", null, 35 * MIN);
    await verdict(
      "chen",
      true,
      "Good to merge: sits above the sidebar now. The card only tests the layout, so I rated it too easy.",
      {
        checks: required.length ? { [required[0]]: await checkProof("chen", required[0]) } : {},
        squares: { [`${P}-row-b2@Phone 375px`]: await shot("chen", "draft-kept.png", draftKept, "Opening the sidebar mid-reply keeps the half-written draft on a phone.") },
        rating: "too_easy",
      },
      30 * MIN,
    );
    await verdict(
      "ivy",
      false,
      "Not good to merge: the draft is lost when the sidebar opens on desktop.",
      { squares: { [`${P}-row-b2@Desktop`]: { result: "fail", attachmentId: await upload("ivy", "draft-lost-desktop.png", draftLost, "image/png"), shows: "On desktop, opening the sidebar mid-reply empties the composer: the draft is gone." } } },
      25 * MIN,
    );
    // The too-easy rating's suggestion: a kind of row the card doesn't have yet.
    await row("s1", { text: "Reload, or go back and forward, right after doing it", source: "suggested", kind: "reload", agentId: null });
    await refreshJudgedStatus(db, issue.id, userId("bob"));

    // The good path: every square proven by three people, so Ziki's own rule moves it to Done · Accepted.
    const done = await db.bug.create({
      data: {
        id: `${P}-issue-accepted`,
        title: "Saving settings shows no confirmation",
        summary: "Pressing Save in settings stores the change but shows nothing, so people press it again.",
        description: "## Acceptance criteria\n- A toast says the settings were saved.",
        status: "done",
        substatus: "requires_review",
        priority: "medium",
        organisationId: organisation.id,
        projectId: project.id,
        typeId: fixType?.id ?? null,
        reporterId: userId("chen"),
        beneficiaryUserId: userId("bob"),
        assigneeId: userId("bob"),
        pullRequestUrl: `${PR}0`,
        pullRequestHeadSha: SHA,
        createdAt: at(2 * 24 * 60 * MIN),
      },
      select: { id: true, number: true, projectId: true, typeId: true, areaId: true },
    });
    await db.issueClaim.create({ data: { bugId: done.id, agentId: agentId("bob"), beneficiaryUserId: userId("bob"), status: "active", claimedAt: at(4 * 60 * MIN), lastHeartbeatAt: at(10 * MIN) } });
    await db.delivery.create({
      data: {
        bugId: done.id, agentId: agentId("bob"), beneficiaryUserId: userId("bob"), summary: "Saving settings shows a toast.", description: "Added a toast after a successful save.",
        pullRequestUrl: `${PR}0`, headSha: SHA, receipt: { verified: [{ check: "Toast after saving", how: "unit test" }], notVerified: [{ check: "Toast on a phone", why: "desktop only" }] }, createdAt: at(50 * MIN),
      },
    });
    await db.testCardRow.create({ data: { id: `${P}-row-a1`, bugId: done.id, agentId: agentId("kemi"), text: "Save twice quickly", source: "beyond", kind: "two_at_once", why: "A second press shouldn't show two toasts." } });
    const doneChecks = checksFor(await loadProofRules(db, organisation.id), done).required;
    for (const [key, ago] of [["kemi", 30], ["dami", 25], ["chen", 20]] as const) {
      const proof = {
        checks: Object.fromEntries(await Promise.all(doneChecks.map(async (id) => [id, await checkProof(key, id)] as const))),
        squares: {
          "criteria:0": await shot(key, "toast.png", desktopFixed, "After pressing Save, a toast says the settings were saved."),
          "receipt:0": await shot(key, "toast-phone.png", phoneFixed, "The toast shows on a phone at 375px."),
          [`${P}-row-a1`]: await shot(key, "save-twice.png", desktopFixed, "Pressing Save twice quickly shows one toast."),
        },
      };
      await db.testVerdict.create({
        data: { bugId: done.id, agentId: agentId(key), onBehalfOfUserId: userId(key), goodToMerge: true, summary: "Good to merge, every square proven.", description: "Proved each square on the card.", pullRequestUrl: `${PR}0`, headSha: SHA, files, proof, createdAt: at(ago * MIN), updatedAt: at(ago * MIN) },
      });
    }
    await refreshJudgedStatus(db, done.id, userId("bob"));
    const states = await db.bug.findMany({ where: { id: { in: [issue.id, done.id] } }, select: { number: true, substatus: true } });

    console.log(states.map((s) => `#${s.number}: ${s.substatus}`).join(", "));
    console.log(`Held by its card: http://localhost:3001/${ORGANISATION_SLUG}/${PROJECT_SLUG}/${issue.number}`);
    console.log(`Accepted: http://localhost:3001/${ORGANISATION_SLUG}/${PROJECT_SLUG}/${done.number}`);
    console.log(`Issues › Delivered: http://localhost:3001/${ORGANISATION_SLUG}/${PROJECT_SLUG}/issues/done`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
