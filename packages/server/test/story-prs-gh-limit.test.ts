/**
 * BUG-28: the tests give the fake `gh` no time limit (`FAKE_GH_TIMEOUT_MS`). A PC under load can start it later than
 * the product's 15 s limit, and the product then takes the "GitHub can't be read" path, which the test wasn't about.
 * A small limit against a slower fake proves the limit the tests pass reaches the PR reads, so passing none means none
 * applies, without waiting 15 s.
 */
import { describe, expect, it } from "vitest";
import { checkRun } from "./fake-gh.ts";
import { MINUTE } from "./manual-clock.ts";
import { prWorld, STORY_BRANCH } from "./story-prs-world.ts";

const w = prWorld();
const URL = "https://github.com/acme/app/pull/14";
/** Slower than the small limit below by far, so the outcome doesn't depend on how busy the PC is. */
const SLOW_GH = { viewDelayMs: 3000 };
const failing14 = {
  prs: [{ number: 14, url: URL, head: STORY_BRANCH, state: "OPEN" as const, checks: [checkRun("FAILURE")] }],
  next: 15,
  ...SLOW_GH,
};
const prOf = () => w.prs.prState(w.repo.main, "STORY-1");

async function readAfterPoll(ghTimeoutMs?: number) {
  await w.start({ status: "In Review", gh: failing14, ghTimeoutMs });
  await w.move("In Review", { pr: URL });
  w.clock.advance(2 * MINUTE);
  await w.settle();
  return prOf()?.status ?? null;
}

describe("the PR reads' gh time limit (BUG-28)", () => {
  it("kills a gh slower than the limit the tests pass", async () => {
    expect(await readAfterPoll(500)).toBeNull();
  });

  it("reads a gh that slow when the tests pass no limit, as a gh a stalled PC starts late must be", async () => {
    expect(await readAfterPoll()).toEqual({ state: "open", checks: "failing" });
  });
});
