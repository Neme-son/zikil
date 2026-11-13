import { randomBytes, randomUUID } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { FILES, feedItem, ok, refused, unique, type Agent } from "./helpers";

/**
 * Deeper testing (#deeper-testing). The sandbox's "Checked" area has one check,
 * Works on the PR (cli/setup.ts), so an issue filed there gets a test card: the
 * check, the issue's acceptance criteria and the delivery receipt's gaps. ada
 * delivers; bob, cara and dana test. A judgement counts only with proof, and the
 * issue is accepted only once every square is proven.
 */
const AREA = `${process.env.ZIKI_CLI_SANDBOX}-checked`;
const SHA = "a3f9c21d4e5b";

/** A real screenshot is tens of kilobytes; random pixels give a PNG Ziki accepts as proof (over 2 KB). */
function screenshot(): string {
  const w = 48, h = 48;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), randomBytes(w * 3)])));
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}

async function upload(agent: Agent, filename: string, dataBase64: string): Promise<string> {
  return (await ok(agent, "upload-attachment", { filename, dataBase64 })).id as string;
}

/** ada files an already-vetted issue in the Checked area and delivers it, with one gap in her receipt. */
async function delivered(label: string): Promise<string> {
  const created = await ok("ada", "create-idea", {
    title: unique(label),
    summary: "Saving a note loses the draft on a slow network.\nThe saved note never shows in the list.",
    description: "## Acceptance criteria\n- Saving keeps the draft\n- The saved note shows in the list",
    idempotencyKey: randomUUID(),
    acknowledgeSimilar: true,
    alreadyVetted: true,
    vettedNote: "Scenario: deeper testing",
    areaId: AREA,
  });
  const id = created.converted.issueId as string;
  const pullRequestUrl = `https://github.com/emerjent/ziki/pull/${70_000 + Math.floor(Math.random() * 9_000)}`;
  await ok("ada", "deliver", {
    id,
    pullRequestUrl,
    headSha: SHA,
    summary: "Saving keeps the draft.",
    description: "The save waits for the server before clearing the draft.",
    testResults: "12 passed",
    receipt: JSON.stringify({ verified: [{ check: "Saving keeps the draft", how: "unit test" }], notVerified: [{ check: "Saving offline", why: "no network toggle" }] }),
  });
  // Good to merge needs a ready pull request, reported by someone independent.
  await ok("eli", "report-pr-status", { id, pullRequestUrl, state: "open", checks: "passing", mergeable: true, headSha: SHA, note: "Open, green, no conflict." });
  return id;
}

/** A judgement with proof for the check and every square on the card. */
async function provenJudgement(agent: Agent, id: string, squares: string[]) {
  const pass = async (name: string) => ({ result: "pass", attachmentId: await upload(agent, `${name}.png`, screenshot()), shows: `It works: ${name} on the delivered commit.` });
  const proof = { checks: { fixed: await pass("fixed") }, squares: Object.fromEntries(await Promise.all(squares.map(async (key) => [key, await pass(key.replace(/[^a-z0-9]/gi, "-"))] as const))) };
  return ok(agent, "submit-test-result", { id, goodToMerge: true, summary: "Good to merge, with proof.", description: "Checked each square on the card and attached a screenshot of each.", files: FILES, proof: JSON.stringify(proof) });
}

const stateOf = async (id: string) => (await ok("ada", "get-issue", { id })).issue as { status: string; substatus: string };

describe("deeper testing: the test card, end to end", () => {
  it("builds the card from the check, the issue's criteria and the receipt, and accepts once every square is proven", async () => {
    const id = await delivered("Card good path");
    const card = await ok("bob", "get-test-card", { id });
    expect(card.on).toBe(true);
    const keys = (card.rows as { key: string }[]).map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(["check:fixed", "criteria:0", "criteria:1", "receipt:0"]));

    // The deliverer's side doesn't draw up its own card; a tester adds a case past the criteria.
    expect((await refused("ada", "add-test-card-rows", { id, rows: JSON.stringify([{ text: "Reload right after saving", source: "beyond", kind: "reload" }]) }, 403)).error).toBe("fixer_cannot_test");
    await ok("bob", "add-test-card-rows", { id, rows: JSON.stringify([{ text: "Reload right after saving", source: "beyond", kind: "reload" }]) });
    const wild = ((await ok("bob", "get-test-card", { id })).rows as { key: string; source: string }[]).find((r) => r.source === "beyond")!.key;

    // A blank image isn't proof.
    const blank = await upload("cara", "blank.png", "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
    const refusedBlank = await refused("cara", "submit-test-result", {
      id, goodToMerge: true, summary: "Good.", description: "Looked fine.", files: FILES,
      proof: JSON.stringify({ checks: { fixed: { result: "pass", attachmentId: blank, shows: "The note saved on the delivered commit." } } }),
    }, 400);
    expect(refusedBlank.message).toMatch(/too small/);

    // A bare good-to-merge is saved but doesn't count.
    await ok("dana", "submit-test-result", { id, goodToMerge: true, summary: "LGTM.", description: "Works for me.", files: FILES });
    expect((await ok("dana", "list-test-verdicts", { id })).verdicts).toHaveLength(1);

    // Three proven judgements, every square covered: accepted.
    const squares = ["criteria:0", "criteria:1", "receipt:0", wild];
    await provenJudgement("bob", id, squares);
    await provenJudgement("cara", id, squares);
    expect(await stateOf(id)).toMatchObject({ status: "done", substatus: "requires_review" });
    await provenJudgement("dana", id, squares);
    const after = await ok("bob", "get-test-card", { id });
    expect(after).toMatchObject({ holes: 0, failed: 0 });
    expect(await stateOf(id)).toMatchObject({ status: "done", substatus: "accepted" });
  });

  it("holds the issue while a square is unproven, and sends a row a screenshot can't prove to the deliverer's test", async () => {
    const id = await delivered("Card CI hand-off");
    await ok("bob", "add-test-card-rows", { id, rows: JSON.stringify([{ text: "Two saves at once both land", source: "beyond", kind: "two_at_once", proof: "test" }]) });
    const row = ((await ok("bob", "get-test-card", { id })).rows as { id: string; source: string }[]).find((r) => r.source === "beyond")!.id;

    // Only the row's writer routes it, and the deliverer is asked for a test.
    expect((await refused("cara", "test-card-row", { id, row, action: "needs_test" }, 403)).error).toBe("not_row_author");
    await ok("bob", "test-card-row", { id, row, action: "needs_test" });
    expect(await feedItem("ada", "add_test", id)).toBeTruthy();
    const routed = ((await ok("bob", "get-test-card", { id })).rows as { id: string; route: string | null }[]).find((r) => r.id === row)!;
    expect(routed.route).toBe("ci");

    // Proven judgements that skip the receipt's gap leave a hole: the issue isn't accepted.
    for (const agent of ["bob", "cara", "dana"] as const) await provenJudgement(agent, id, ["criteria:0", "criteria:1"]);
    expect((await ok("bob", "get-test-card", { id })).holes).toBe(1);
    expect(await stateOf(id)).toMatchObject({ substatus: "requires_review" });

    // The deliverer attaches the test's run as text; the row stops waiting on CI.
    const log = await upload("ada", "concurrent-saves.log", Buffer.from("✓ two saves at once both land (412 ms)\n1 passed\n").toString("base64"));
    await ok("ada", "test-card-row", { id, row, action: "test", attachmentId: log });
    expect((await ok("bob", "get-test-card", { id })).waitingOnCi).toBe(0);
  });
});
