/**
 * STORY-11 AC3, AC4, AC5: each project's open PRs are read again through `gh` on its interval and when the window
 * regains focus; the PR's state and checks reach the card and the Work rows; and when checks run in CI, the PR's
 * checks make the story Verified or take it away. Real repository, watches, lane and rules; GitHub, the remote and
 * the clock are faked.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_WORK_LIST, evidenceState } from "@featra/work-format";
import { checkRun } from "./fake-gh.ts";
import { MINUTE } from "./manual-clock.ts";
import { prWorld, STORY_BRANCH } from "./story-prs-world.ts";

const w = prWorld();
const URL = "https://github.com/acme/app/pull/14";
const open14 = (checks: unknown[] = []) => ({
  prs: [{ number: 14, url: URL, head: STORY_BRANCH, state: "OPEN" as const, checks }],
  next: 15,
});
const reads = async () => (await w.callsOf("pr view")).length;
const withChecks = (checks: unknown[]) =>
  w.gh.change((s) => {
    for (const pr of s.prs) pr.checks = checks;
  });
const prOf = () => w.prs.prState(w.repo.main, "STORY-1");

/** Moves the clock and lets the reads it started finish. */
async function after(ms: number) {
  w.clock.advance(ms);
  await w.settle();
}

describe("the PR's state and checks (AC3)", { timeout: 60_000 }, () => {
  it("reach the card and the story's Work row once read", async () => {
    await w.start({ status: "In Review", gh: open14([checkRun("FAILURE")]) });
    await w.move("In Review", { pr: URL });
    await after(2 * MINUTE);
    expect(prOf()).toEqual({ status: { state: "open", checks: "failing" }, create: false, opening: false, note: null });
    const scan = await w.watches.scan(w.repo.main);
    const list = w.prs.decorate(w.repo.main, scan?.list ?? EMPTY_WORK_LIST);
    const row = list.epics.flatMap((e) => e.features.flatMap((f) => f.stories)).find((s) => s.id === "STORY-1");
    expect(row).toMatchObject({ pr: URL, prStatus: { state: "open", checks: "failing" } });
  });

  it("follow a draft, a merge and a close", async () => {
    await w.start({ status: "In Review", gh: open14() });
    await w.move("In Review", { pr: URL });
    await w.gh.change((s) => {
      s.prs[0]!.isDraft = true;
    });
    await after(2 * MINUTE);
    expect(prOf()?.status).toEqual({ state: "draft", checks: "none" });
    await w.gh.change((s) => {
      s.prs[0]!.state = "MERGED";
    });
    await after(2 * MINUTE);
    expect(prOf()?.status).toEqual({ state: "merged", checks: "none" });
  });
});

describe("reading PRs again (AC4)", { timeout: 60_000 }, () => {
  it("reads at start, then every N minutes from the project's setting", async () => {
    await w.start({ yaml: "prRefreshMinutes: 5\n", status: "In Review", gh: open14() });
    await w.move("In Review", { pr: URL });
    const first = await reads();
    await after(4 * MINUTE);
    expect(await reads()).toBe(first);
    await after(1 * MINUTE);
    expect(await reads()).toBe(first + 1);
    await after(5 * MINUTE);
    expect(await reads()).toBe(first + 2);
  });

  it("waits the new interval once the user changes it", async () => {
    await w.start({ status: "In Review", gh: open14() });
    await w.move("In Review", { pr: URL });
    const before = await reads();
    await w.settings.set(w.repo.main, { prRefreshMinutes: 10 });
    await w.settle();
    await after(2 * MINUTE);
    expect(await reads()).toBe(before);
    await after(8 * MINUTE);
    expect(await reads()).toBe(before + 1);
  });

  it("reads soon after the window regains focus, once for a burst of focus changes", async () => {
    await w.start({ status: "In Review", gh: open14() });
    await w.move("In Review", { pr: URL });
    const before = await reads();
    w.prs.focus();
    w.prs.focus();
    await after(500);
    w.prs.focus();
    await after(999);
    expect(await reads()).toBe(before);
    await after(1);
    expect(await reads()).toBe(before + 1);
  });

  it("never runs two reads of a project at once", async () => {
    await w.start({ status: "In Review", gh: open14() });
    await w.move("In Review", { pr: URL });
    const before = await reads();
    const one = w.prs.refresh(w.repo.main);
    const two = w.prs.refresh(w.repo.main);
    const three = w.prs.refresh(w.repo.main);
    await Promise.all([one, two, three]);
    // The first read, then one more for the requests that came while it ran.
    expect(await reads()).toBe(before + 2);
  });

  it("stops reading merged or closed PRs and the PRs of done stories", async () => {
    await w.start({ status: "In Review", gh: open14() });
    await w.move("In Review", { pr: URL });
    await w.gh.change((s) => {
      s.prs[0]!.state = "CLOSED";
    });
    await after(2 * MINUTE);
    const closed = await reads();
    await after(2 * MINUTE);
    expect(await reads()).toBe(closed);
    await w.gh.change((s) => {
      s.prs[0]!.state = "OPEN";
    });
    await w.move("Done", { pr: URL });
    await after(2 * MINUTE);
    expect(await reads()).toBe(closed);
  });

  it("forgets what it read of a project once the project closes", async () => {
    await w.start({ status: "In Review", gh: open14([checkRun("FAILURE")]) });
    await w.move("In Review", { pr: URL });
    await after(2 * MINUTE);
    const scan = await w.watches.scan(w.repo.main);
    const rowOf = () =>
      w.prs
        .decorate(w.repo.main, scan?.list ?? EMPTY_WORK_LIST)
        .epics.flatMap((e) => e.features.flatMap((f) => f.stories))
        .find((s) => s.id === "STORY-1");
    expect(rowOf()?.prStatus).toEqual({ state: "open", checks: "failing" });
    w.allowed.set([]);
    await w.settle();
    expect(rowOf()?.prStatus).toBeUndefined();
  });

  it("stops when the project closes", async () => {
    await w.start({ status: "In Review", gh: open14() });
    await w.move("In Review", { pr: URL });
    w.allowed.set([]);
    const before = await reads();
    await after(10 * MINUTE);
    expect(await reads()).toBe(before);
    expect(w.clock.timersSet()).toBe(0);
  });

  it("reads nothing in local mode", async () => {
    await w.start({ status: "In Review", gh: { ...open14(), signedIn: false } });
    await w.move("In Review", { pr: URL });
    await after(10 * MINUTE);
    expect(await reads()).toBe(0);
  });
});

describe("CI evidence (AC5)", { timeout: 60_000 }, () => {
  it("passing checks mark the story Verified and a failing check removes it, by system", async () => {
    await w.start({ yaml: "checksWhere: ci\n", status: "In Review", gh: open14([checkRun(null)]) });
    await w.move("In Review", { pr: URL });
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).verified).toBe(false);
    await withChecks([checkRun("SUCCESS"), checkRun("SKIPPED", "docs")]);
    await after(2 * MINUTE);
    await w.settle();
    const verified = await w.read();
    expect(evidenceState(verified).verified).toBe(true);
    expect(verified.history.at(-1)).toMatchObject({ field: "evidence", to: "verified", by: "system" });
    // Checks running again (a new push) change nothing until they finish.
    await withChecks([checkRun("SUCCESS"), checkRun(null, "e2e")]);
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).verified).toBe(true);
    await withChecks([checkRun("SUCCESS"), checkRun("FAILURE", "e2e")]);
    await after(2 * MINUTE);
    await w.settle();
    const failed = await w.read();
    expect(evidenceState(failed).verified).toBe(false);
    expect(failed.history.at(-1)).toMatchObject({ field: "evidence", to: "unverified", by: "system" });
  });

  it("never keeps Verified for a commit the PR doesn't have yet: a new commit needs its own passing checks", async () => {
    await w.start({ yaml: "checksWhere: ci\n" });
    await w.moveOn("In Review");
    const url = (await w.read()).pr;
    expect(url).toBe("https://github.com/acme/app/pull/1");
    const head = () => w.repo.git(w.tree, "rev-parse", "HEAD").trim();
    const a = head();
    await w.gh.change((s) => {
      s.prs[0]!.checksAt = { [a]: [checkRun("SUCCESS")] };
    });
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).verified).toBe(true);
    // Back to work: commit B lands in the worktree, then the story goes back to review.
    await w.moveOn("In Progress");
    w.repo.commit(w.tree, "B");
    const b = head();
    expect(b).not.toBe(a);
    await w.moveOn("In Review");
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).verified).toBe(false);
    // B was pushed to the PR; its checks run, then pass.
    expect(w.repo.git(w.remote, "rev-parse", STORY_BRANCH).trim()).toBe(b);
    await w.gh.change((s) => {
      s.prs[0]!.checksAt = { [a]: [checkRun("SUCCESS")], [b]: [checkRun(null)] };
    });
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).verified).toBe(false);
    await w.gh.change((s) => {
      s.prs[0]!.checksAt = { [a]: [checkRun("SUCCESS")], [b]: [checkRun("SUCCESS")] };
    });
    await after(2 * MINUTE);
    await w.settle();
    const verified = await w.read();
    expect(evidenceState(verified).verified).toBe(true);
    expect(verified.history.filter((e) => e.field === "evidence").map((e) => e.to)).toEqual([
      "verified",
      "unverified",
      "verified",
    ]);
  });

  it("counts the repo's required checks: an optional check failing doesn't stop Verified, a required one does", async () => {
    const checks = [checkRun("SUCCESS", "ci"), checkRun("FAILURE", "lint")];
    await w.start({ yaml: "checksWhere: ci\n", status: "In Review", gh: open14(checks) });
    await w.gh.change((s) => {
      s.prs[0]!.required = ["ci"];
    });
    await w.move("In Review", { pr: URL });
    await after(2 * MINUTE);
    await w.settle();
    expect(evidenceState(await w.read()).verified).toBe(true);
    // The PR's own chip still shows every check.
    expect(prOf()?.status?.checks).toBe("failing");
    expect(await w.callsOf("pr checks")).toContainEqual(["pr", "checks", URL, "--required", "--json", "bucket,name"]);
    await withChecks([checkRun("FAILURE", "ci"), checkRun("SUCCESS", "lint")]);
    await after(2 * MINUTE);
    await w.settle();
    expect(evidenceState(await w.read()).verified).toBe(false);
  });

  it("counts every reported check when the repo requires none", async () => {
    await w.start({ yaml: "checksWhere: ci\n", status: "In Review", gh: open14([checkRun("SUCCESS", "ci")]) });
    await w.move("In Review", { pr: URL });
    await after(2 * MINUTE);
    await w.settle();
    expect(evidenceState(await w.read()).verified).toBe(true);
    await withChecks([checkRun("SUCCESS", "ci"), checkRun("FAILURE", "lint")]);
    await after(2 * MINUTE);
    await w.settle();
    expect(evidenceState(await w.read()).verified).toBe(false);
  });

  it("records nothing from a read that finishes after its project closed", async () => {
    await w.start({ yaml: "checksWhere: ci\n", status: "In Review", gh: open14([checkRun("SUCCESS")]) });
    await w.gh.change((s) => {
      s.viewDelayMs = 1500;
    });
    await w.move("In Review", { pr: URL });
    await w.settle();
    const before = await reads();
    const reading = w.prs.refresh(w.repo.main);
    await expect.poll(reads, { timeout: 10_000 }).toBeGreaterThan(before);
    w.allowed.set([]);
    await reading;
    await w.settle();
    expect((await w.read()).history.some((e) => e.field === "evidence")).toBe(false);
  });

  it("records nothing when the project's checks run on this computer", async () => {
    await w.start({ yaml: "checksWhere: local\n", status: "In Review", gh: open14([checkRun("SUCCESS")]) });
    await w.move("In Review", { pr: URL });
    await after(2 * MINUTE);
    expect(prOf()?.status?.checks).toBe("passing");
    expect((await w.read()).history.some((e) => e.field === "evidence")).toBe(false);
  });

  it("records nothing for a story that isn't in review", async () => {
    await w.start({ yaml: "checksWhere: ci\n", gh: open14([checkRun("SUCCESS")]) });
    await w.move("In Progress", { pr: URL });
    await after(2 * MINUTE);
    expect((await w.read()).history.some((e) => e.field === "evidence")).toBe(false);
  });
});
