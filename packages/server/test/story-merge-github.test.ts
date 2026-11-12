/**
 * STORY-12: Merge with GitHub usable. The story's PR merges on GitHub with a merge commit, at the head commit Featra
 * checked (`gh pr merge --merge --match-head-commit`), and a PR merged on GitHub outside Featra settles the same way.
 * Real merge, settle, PR poller, scanner, card lane and work-format rules on a real repository; GitHub is the fake `gh`
 * over a bare remote, and the chat manager and the clock are faked.
 */
import { describe, expect, it } from "vitest";
import { isMerged, MERGE_MESSAGES, parseCard } from "@featra/work-format";
import { MINUTE } from "./manual-clock.ts";
import { FEATURE_BRANCH, mergeWorld, SESSION, STORY_BRANCH } from "./story-merge-world.ts";

const m = mergeWorld();
const { w } = m;
const PR = "https://github.com/acme/app/pull/1";
const remoteGit = (...args: string[]) => w.repo.git(w.remote, ...args).trim();
const onFeature = () => parseCard(w.repo.show(w.repo.main, FEATURE_BRANCH, "STORY-1"));

/** What a merged story leaves: no worktree, no local or remote branch, its session retired, the card merged. */
function expectSettled() {
  expect(m.treeExists()).toBe(false);
  expect(m.hasBranch(STORY_BRANCH)).toBe(false);
  expect(w.remoteBranches()).not.toContain(STORY_BRANCH);
  expect(m.retired).toEqual([SESSION]);
  const card = onFeature();
  expect(isMerged(card)).toBe(true);
  expect(card.history.at(-1)).toMatchObject({ field: "merged", to: FEATURE_BRANCH, by: "system" });
}

/** Moves the clock past a poll and lets what it started finish. */
async function poll() {
  w.clock.advance(2 * MINUTE);
  await w.settle();
  await w.settle();
}

describe("a merge through the PR (AC2)", { timeout: 60_000 }, () => {
  it("merges the PR with a merge commit at the head it checked, then settles the story", async () => {
    await m.start();
    await m.verified();
    expect((await w.read()).pr).toBe(PR);
    const story = m.tip(STORY_BRANCH);
    const base = remoteGit("rev-parse", FEATURE_BRANCH);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [] });

    const [call] = await w.callsOf("pr merge");
    expect(call).toEqual(["pr", "merge", PR, "--merge", "--match-head-commit", story]);
    expect((await w.gh.load()).prs[0]?.state).toBe("MERGED");
    const merge = remoteGit("rev-parse", FEATURE_BRANCH);
    expect(m.parents(w.remote, merge)).toEqual([base, story]);
    // The card's merge is a commit on the local feature branch, on top of GitHub's merge commit; it isn't pushed.
    expect(m.parents(w.repo.main, FEATURE_BRANCH)).toEqual([merge]);
    expectSettled();
  });

  it("refuses a head GitHub doesn't have: a commit not pushed yet merges nothing", async () => {
    await m.start();
    await m.verified();
    w.repo.commit(w.tree, "not pushed");
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(MERGE_MESSAGES.stale("STORY-1"));
    expect(await w.callsOf("pr merge")).toEqual([]);
    expect(m.treeExists()).toBe(true);
  });

  it("refuses a story with no PR", async () => {
    await m.start({ yaml: "openStoryPrs: false\n" });
    await m.verified();
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(MERGE_MESSAGES.noPr("STORY-1"));
  });
});

describe("a PR merged on GitHub outside Featra (AC2)", { timeout: 60_000 }, () => {
  it("is noticed by the PR poller and settles the same way", async () => {
    await m.start();
    await m.verified();
    const base = remoteGit("rev-parse", FEATURE_BRANCH);
    const head = remoteGit("rev-parse", STORY_BRANCH);
    const tree = remoteGit("merge-tree", "--write-tree", base, head).split("\n")[0]!;
    const merge = remoteGit("commit-tree", tree, "-p", base, "-p", head, "-m", "Merge pull request #1");
    remoteGit("update-ref", `refs/heads/${FEATURE_BRANCH}`, merge, base);
    await w.gh.change((s) => {
      s.prs[0]!.state = "MERGED";
    });
    await poll();
    expect(await w.callsOf("pr merge")).toEqual([]);
    expect(m.parents(w.repo.main, FEATURE_BRANCH)).toEqual([merge]);
    expectSettled();
    expect(m.logs).toEqual([]);
  });
});

describe("a conflict on GitHub (AC4)", { timeout: 60_000 }, () => {
  it("merges nothing, tells the session the files, and puts the story back in In Progress", async () => {
    await m.start();
    await m.onFeature("work.txt", "feature's\n");
    await m.verified();
    const base = remoteGit("rev-parse", FEATURE_BRANCH);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(
      MERGE_MESSAGES.conflict("STORY-1", ["work.txt"], "In Progress"),
    );
    expect(await w.callsOf("pr merge")).toEqual([]);
    expect(remoteGit("rev-parse", FEATURE_BRANCH)).toBe(base);
    expect((await w.gh.load()).prs[0]?.state).toBe("OPEN");
    expect(m.sent.map((s) => s.chat)).toEqual([SESSION]);
    expect(m.sent[0]?.text).toContain("- work.txt");
    const card = await w.read();
    expect(card.status).toBe("In Progress");
    expect(card.history.at(-1)).toMatchObject({ field: "status", to: "In Progress", by: "system" });
    expect(m.treeExists()).toBe(true);
  });
});
