import { beforeAll, describe, expect, it } from "vitest";
import { confirm, fileIdea, fileIssue, ok, refused, toIssue, type Agent } from "./helpers";
import { minutesAgo, setStakeClock } from "./clock";

type Item = { kind: string; key: string; canAct: boolean; issue?: { id: string }; actions: { name: string; path: string }[] };
type Stake = { id: string; agentId: string; status: string; resolution?: string | null; bugId?: string | null; claimId?: string | null; votes?: number; refreshDueAt: string | null; windowEndsAt: string | null; contestEndsAt: string | null };

/**
 * Stakes (#stakes): fast claims. bob stakes an Open issue; cara counters, so
 * the two go to a vote; the contenders can't vote, dana can; bids are not
 * awarded while it is staked; a withdrawn counter puts bob's stake back on its
 * window; refreshes are proof of life; and the caps hold. The 10- and
 * 30-minute timers are left to the sweep: nothing here waits for them.
 */
describe("stakes", () => {
  let id: string;
  let bobStake: string;
  let caraStake: string;

  const items = async (agent: Agent) => (await ok(agent, "work")).items as Item[];
  const stakes = async () => (await ok("ada", "list-stakes", { id })).items as Stake[];

  beforeAll(async () => {
    id = await fileIssue("ada", "CLI stakes: the export button hangs", ["bob", "cara", "eli"]);
    await confirm(id, ["bob", "cara"]);
  });

  it("takes a stake with a plan, opening its 10-minute window", async () => {
    await refused("bob", "stake-issue", { id }, 400);
    const placed = await ok("bob", "stake-issue", { id, summary: "Fix the export hang.", description: "The CSV writer awaits a stream that never ends; close it after the last row." });
    expect(placed).toMatchObject({ created: true, contested: false, stake: { status: "open" } });
    expect(placed.stake.windowEndsAt).toBeTruthy();
    expect(placed.stake.refreshDueAt).toBeTruthy();
    bobStake = placed.stake.id;
    // Staking again refreshes it.
    expect(await ok("bob", "stake-issue", { id })).toMatchObject({ created: false, stake: { id: bobStake } });
    const feed = await items("bob");
    expect(feed.some((item) => item.kind === "refresh_stake" && item.issue?.id === id)).toBe(true);
  });

  it("refuses a bid award while the issue is staked", async () => {
    const bid = await ok("eli", "bid", { id, summary: "I can fix it.", description: "Close the stream and add a test." });
    const bidId = bid.bid_id as string;
    expect((await refused("dana", "award-bid", { id: bidId }, 409)).error).toBe("issue_staked");
  });

  it("turns a counter-stake into a contest the contenders can't vote in", async () => {
    const counter = await ok("cara", "stake-issue", { id, summary: "Rewrite the export.", description: "Stream rows straight to the response instead of buffering them." });
    expect(counter).toMatchObject({ created: true, contested: true, stake: { status: "contested" } });
    caraStake = counter.stake.id;
    const both = await stakes();
    expect(both.filter((stake) => stake.status === "contested")).toHaveLength(2);
    // A third agent can't join; it votes instead.
    expect((await refused("ada", "stake-issue", { id, summary: "Me too.", description: "I can do it as well." }, 409)).error).toBe("contest_full");
    expect((await refused("bob", "vote-stake", { id: caraStake }, 403)).error).toBe("own_contest");
    const feed = await items("dana");
    expect(feed.some((item) => item.kind === "vote_stake" && item.issue?.id === id)).toBe(true);
    const voted = await ok("dana", "vote-stake", { id: caraStake });
    expect(voted.votes[caraStake]).toBeGreaterThan(0);
    // Voting for the other stake moves the vote.
    const moved = await ok("dana", "vote-stake", { id: bobStake });
    expect(moved.votes[caraStake]).toBe(0);
    expect(moved.votes[bobStake]).toBeGreaterThan(0);
  });

  it("puts the other stake back on its window when a contender withdraws", async () => {
    await refused("bob", "withdraw-stake", { id: caraStake }, 403);
    await ok("cara", "withdraw-stake", { id: caraStake });
    const after = await stakes();
    expect(after.find((stake) => stake.id === bobStake)).toMatchObject({ status: "open" });
    expect(after.find((stake) => stake.id === caraStake)).toMatchObject({ status: "dropped" });
    expect((await refused("cara", "refresh-stake", { id: caraStake }, 409)).error).toBe("stake_ended");
    expect((await ok("bob", "refresh-stake", { id: bobStake })).stake).toMatchObject({ id: bobStake, status: "open" });
  });

  it("holds an owner to two open stakes, ideas included", async () => {
    const ideaA = await fileIdea("ada", "CLI stakes: idea one");
    const ideaB = await fileIdea("ada", "CLI stakes: idea two");
    const plan = { summary: "I will take it.", description: "As soon as it becomes an issue, I fix it." };
    expect(await ok("bob", "stake-idea", { id: ideaA, ...plan })).toMatchObject({ created: true, stake: { status: "waiting" } });
    expect((await refused("bob", "stake-idea", { id: ideaB, ...plan }, 409)).error).toBe("stake_limit");
    // Clean up, so the sandbox's caps are free for other scenarios.
    const mine = (await items("bob")).filter((item) => item.kind === "refresh_stake");
    for (const item of mine) {
      const path = item.actions.find((action) => action.name === "refresh_stake")?.path ?? "";
      const stakeId = /\/stakes\/([^/]+)\/refresh/.exec(path)?.[1];
      if (stakeId) await ok("bob", "withdraw-stake", { id: stakeId });
    }
  });
});

const PLAN = { summary: "I will fix it.", description: "Find the cause, fix it with a test, and open a pull request." };

/**
 * The timed paths (#stakes), with the stake's clock moved in the local
 * database (./clock.ts): a 10-minute win, a drop for no refresh, contests
 * decided by votes and by a tie, an idea stake that moves to its issue and
 * wins, an idea stake that times out, and the in-progress limit.
 */
describe("stakes over time", () => {
  const stakesOn = async (id: string) => (await ok("ada", "list-stakes", { id })).items as Stake[];
  const issue = async (id: string) => (await ok("ada", "get-issue", { id })).issue as { status: string; substatus: string; holder: unknown };
  /** The issue is held by the claim the stake won. */
  const heldBy = async (id: string, stakeId: string) => {
    const won = (await stakesOn(id)).find((entry) => entry.id === stakeId);
    expect(won?.claimId).toBeTruthy();
    expect((await issue(id)).holder).toMatchObject({ id: won?.claimId, status: "active", via: "claim" });
  };

  it("wins the issue outright when nobody counters for 10 minutes", async () => {
    const id = await fileIssue("ada", "CLI stakes: the upload spinner never stops", ["bob", "cara", "eli"]);
    const bid = await ok("eli", "bid", { id, ...PLAN });
    const bidId = bid.bid_id as string;
    const { stake } = await ok("bob", "stake-issue", { id, ...PLAN });
    await setStakeClock(stake.id, { windowEndsAt: minutesAgo(1), lastRefreshAt: minutesAgo(1) });
    expect((await stakesOn(id)).find((entry) => entry.id === stake.id)).toMatchObject({ status: "won", resolution: "won" });
    const now = await issue(id);
    expect(now).toMatchObject({ status: "in_progress" });
    await heldBy(id, stake.id);
    // The other open bids are withdrawn, and the refreshing is over.
    expect(JSON.stringify(await ok("ada", "list-bids", { id }))).not.toContain(bidId);
    expect((await refused("bob", "refresh-stake", { id: stake.id }, 409)).error).toBe("stake_ended");
    await ok("bob", "release-claim", { id, reason: "Scenario clean-up." });
  });

  it("drops a stake that was not refreshed within 5 minutes", async () => {
    const id = await fileIssue("ada", "CLI stakes: the tooltip flickers", ["bob", "cara", "eli"]);
    const { stake } = await ok("bob", "stake-issue", { id, ...PLAN });
    await setStakeClock(stake.id, { lastRefreshAt: minutesAgo(6) });
    expect((await refused("bob", "refresh-stake", { id: stake.id }, 409)).error).toBe("stake_ended");
    expect((await stakesOn(id)).find((entry) => entry.id === stake.id)).toMatchObject({ status: "dropped", resolution: "no_refresh" });
    expect(await issue(id)).toMatchObject({ substatus: "requires_confirmation", holder: null });
  });

  it("decides a contest by its weighted votes", async () => {
    const id = await fileIssue("ada", "CLI stakes: the search box loses focus", ["bob", "cara", "eli"]);
    const first = (await ok("bob", "stake-issue", { id, ...PLAN })).stake;
    const second = (await ok("cara", "stake-issue", { id, ...PLAN })).stake;
    // dana, a manager agent, backs the later stake.
    await ok("dana", "vote-stake", { id: second.id });
    for (const stake of [first, second]) await setStakeClock(stake.id, { contestEndsAt: minutesAgo(1), lastRefreshAt: minutesAgo(1) });
    const settled = await stakesOn(id);
    expect(settled.find((entry) => entry.id === second.id)).toMatchObject({ status: "won", resolution: "won_vote" });
    expect(settled.find((entry) => entry.id === first.id)).toMatchObject({ status: "lost", resolution: "outvoted" });
    await heldBy(id, second.id);
    await ok("cara", "release-claim", { id, reason: "Scenario clean-up." });
  });

  it("gives a tied contest to the earlier stake", async () => {
    const id = await fileIssue("ada", "CLI stakes: the badge count is off by one", ["bob", "cara", "eli"]);
    const first = (await ok("bob", "stake-issue", { id, ...PLAN })).stake;
    const second = (await ok("cara", "stake-issue", { id, ...PLAN })).stake;
    for (const stake of [first, second]) await setStakeClock(stake.id, { contestEndsAt: minutesAgo(1), lastRefreshAt: minutesAgo(1) });
    const settled = await stakesOn(id);
    expect(settled.find((entry) => entry.id === first.id)).toMatchObject({ status: "won", resolution: "won_tie" });
    expect(settled.find((entry) => entry.id === second.id)).toMatchObject({ status: "lost", resolution: "tie_earlier" });
    await ok("bob", "release-claim", { id, reason: "Scenario clean-up." });
  });

  it("drops a contender that stops refreshing, leaving the other on its window", async () => {
    const id = await fileIssue("ada", "CLI stakes: the chart legend overlaps", ["bob", "cara", "eli"]);
    const first = (await ok("bob", "stake-issue", { id, ...PLAN })).stake;
    const second = (await ok("cara", "stake-issue", { id, ...PLAN })).stake;
    await setStakeClock(second.id, { lastRefreshAt: minutesAgo(6) });
    const settled = await stakesOn(id);
    expect(settled.find((entry) => entry.id === second.id)).toMatchObject({ status: "dropped", resolution: "no_refresh" });
    expect(settled.find((entry) => entry.id === first.id)).toMatchObject({ status: "open" });
    await ok("bob", "withdraw-stake", { id: first.id });
  });

  it("moves a stake on an idea to the issue it becomes, where it wins after its window", async () => {
    const ideaId = await fileIdea("ada", "CLI stakes: the settings page forgets the theme");
    const { stake } = await ok("bob", "stake-idea", { id: ideaId, ...PLAN });
    expect(stake).toMatchObject({ status: "waiting", bugId: null });
    expect(stake.expiresAt).toBeTruthy();
    const id = await toIssue(ideaId, ["bob", "cara", "eli"]);
    const moved = (await stakesOn(id)).find((entry) => entry.id === stake.id);
    expect(moved).toMatchObject({ status: "open", bugId: id });
    expect(moved?.windowEndsAt).toBeTruthy();
    await ok("bob", "refresh-stake", { id: stake.id });
    await setStakeClock(stake.id, { windowEndsAt: minutesAgo(1) });
    expect((await stakesOn(id)).find((entry) => entry.id === stake.id)).toMatchObject({ status: "won" });
    expect(await issue(id)).toMatchObject({ status: "in_progress" });
    await ok("bob", "release-claim", { id, reason: "Scenario clean-up." });
  });

  it("drops a stake on an idea after 24 hours if the idea is still an idea", async () => {
    const ideaId = await fileIdea("ada", "CLI stakes: an idea nobody converts");
    const { stake } = await ok("bob", "stake-idea", { id: ideaId, ...PLAN });
    await setStakeClock(stake.id, { expiresAt: minutesAgo(1) });
    expect(await refused("bob", "refresh-stake", { id: stake.id }, 409)).toMatchObject({ error: "stake_ended", resolution: "idea_timeout" });
  });

  it("refuses a new stake while the owner holds two issues In progress", async () => {
    const won: string[] = [];
    for (const label of ["CLI stakes: first held", "CLI stakes: second held"]) {
      const id = await fileIssue("ada", label, ["bob", "cara", "eli"]);
      const { stake } = await ok("bob", "stake-issue", { id, ...PLAN });
      await setStakeClock(stake.id, { windowEndsAt: minutesAgo(1), lastRefreshAt: minutesAgo(1) });
      expect((await stakesOn(id)).find((entry) => entry.id === stake.id)).toMatchObject({ status: "won" });
      won.push(id);
    }
    const third = await fileIssue("ada", "CLI stakes: third, refused", ["bob", "cara", "eli"]);
    expect((await refused("bob", "stake-issue", { id: third, ...PLAN }, 409)).error).toBe("in_progress_limit");
    for (const id of won) await ok("bob", "release-claim", { id, reason: "Scenario clean-up." });
    // Freed, bob may stake again.
    const again = await ok("bob", "stake-issue", { id: third, ...PLAN });
    expect(again).toMatchObject({ created: true });
    await ok("bob", "withdraw-stake", { id: again.stake.id });
  });
});
