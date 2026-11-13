/**
 * STORY-12: Merge with GitHub usable. The story's PR merges on GitHub with a merge commit, at the head commit Featra
 * checked (`gh pr merge --merge --match-head-commit`), and a PR merged on GitHub outside Featra settles the same way.
 * Real merge, settle, PR poller, scanner, card lane and work-format rules on a real repository; GitHub is the fake `gh`
 * over a bare remote, and the chat manager and the clock are faked.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evidenceState, isMerged, MERGE_MESSAGES, parseCard } from "@featra/work-format";
import { runGit } from "../src/git-run.ts";
import { REMOVE_NOTES } from "../src/merge-git.ts";
import { SETTLE_NOTES } from "../src/merge-settle.ts";
import { cardPath } from "./card-repo.ts";
import { checkRun } from "./fake-gh.ts";
import { MINUTE } from "./manual-clock.ts";
import { FEATURE_BRANCH, mergeWorld, SESSION, STORY_BRANCH } from "./story-merge-world.ts";

const m = mergeWorld();
const { w } = m;
const PR = "https://github.com/acme/app/pull/1";
const remoteGit = (...args: string[]) => w.repo.git(w.remote, ...args).trim();
const onFeature = () => parseCard(w.repo.show(w.repo.main, FEATURE_BRANCH, "STORY-1"));
/** What a merge on GitHub leaves to do: the card's commit on the local feature branch isn't pushed. */
const AHEAD = SETTLE_NOTES.ahead(FEATURE_BRANCH, 1);

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
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [AHEAD] });

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
    const merge = mergeOutside();
    await w.gh.change((s) => {
      s.prs[0]!.state = "MERGED";
    });
    await poll();
    expect(await w.callsOf("pr merge")).toEqual([]);
    expect(m.parents(w.repo.main, FEATURE_BRANCH)).toEqual([merge]);
    expectSettled();
    expect(m.logs).toEqual([`STORY-1 merged on GitHub: ${AHEAD}`]);
  });

  it("keeps a worktree with uncommitted work, its files intact, and says so (review fix)", async () => {
    await m.start();
    await m.verified();
    mergeOutside();
    await writeFile(join(w.tree, "draft.txt"), "unsaved\n");
    await w.gh.change((s) => {
      s.prs[0]!.state = "MERGED";
    });
    await poll();
    expect(isMerged(onFeature())).toBe(true);
    expect(m.treeExists()).toBe(true);
    expect(await readFile(join(w.tree, "draft.txt"), "utf8")).toBe("unsaved\n");
    expect(m.hasBranch(STORY_BRANCH)).toBe(true);
    expect(m.logs).toContainEqual(expect.stringMatching(/^STORY-1 merged on GitHub: The worktree .+ has uncommitted/));
    expect(m.logs).toContain(`STORY-1 merged on GitHub: ${REMOVE_NOTES.branch(STORY_BRANCH)}`);
  });
});

/** The story's PR merged on GitHub's side, with a merge commit as GitHub makes it; that commit. */
function mergeOutside() {
  const base = remoteGit("rev-parse", FEATURE_BRANCH);
  const head = remoteGit("rev-parse", STORY_BRANCH);
  const tree = remoteGit("merge-tree", "--write-tree", base, head).split("\n")[0]!;
  const merge = remoteGit("commit-tree", tree, "-p", base, "-p", head, "-m", "Merge pull request #1");
  remoteGit("update-ref", `refs/heads/${FEATURE_BRANCH}`, merge, base);
  return merge;
}

describe("the head GitHub merges, with checks on CI (review fix)", { timeout: 60_000 }, () => {
  it("refuses a commit pushed since CI passed, before the poller reads it, then merges once CI passes it", async () => {
    await m.start({ yaml: "checksWhere: ci\n" });
    await m.verified();
    const a = m.tip(STORY_BRANCH);
    await w.gh.change((s) => {
      s.prs[0]!.checksAt = { [a]: [checkRun("SUCCESS")] };
    });
    w.repo.commit(w.tree, "B");
    w.repo.git(w.tree, "push", "-q", "origin", STORY_BRANCH);
    const b = m.tip(STORY_BRANCH);
    expect(evidenceState(await w.read()).verified).toBe(true);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(MERGE_MESSAGES.stale("STORY-1"));
    expect(await w.callsOf("pr merge")).toEqual([]);
    expect(m.treeExists()).toBe(true);
    await w.gh.change((s) => {
      s.prs[0]!.checksAt = { [a]: [checkRun("SUCCESS")], [b]: [checkRun("SUCCESS")] };
    });
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [AHEAD] });
    expect((await w.callsOf("pr merge"))[0]).toContain(b);
  });
});

describe("the card's commit on the feature branch (review fixes)", { timeout: 60_000 }, () => {
  it("has the card's uncommitted edits", async () => {
    await m.start();
    await m.verified();
    await w.repo.write(w.tree, { ...(await w.read()), notes: "Edited, not committed." });
    await w.settle();
    await m.merges.merge(w.repo.main, "STORY-1");
    const card = onFeature();
    expect(card.notes).toContain("Edited, not committed.");
    expect(isMerged(card)).toBe(true);
  });

  it("merges a local feature branch that has commits GitHub doesn't, and says how far ahead it is", async () => {
    await m.start();
    await m.verified();
    await m.onFeature("local.txt", "not pushed\n");
    const local = m.tip(FEATURE_BRANCH);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({
      remains: [SETTLE_NOTES.ahead(FEATURE_BRANCH, 2)],
    });
    expect(m.parents(w.repo.main, FEATURE_BRANCH)).toEqual([local, remoteGit("rev-parse", FEATURE_BRANCH)]);
    expect(w.repo.git(w.repo.main, "show", `${FEATURE_BRANCH}:local.txt`).trim()).toBe("not pushed");
    expectSettled();
  });

  it("changes nothing when the feature branch can't take it, so merging again settles it", async () => {
    await m.start();
    await m.verified();
    // The feature branch is checked out, with a change to the card in the way of the fast-forward.
    w.repo.git(w.repo.main, "checkout", "-q", FEATURE_BRANCH);
    const card = join(w.repo.main, ...cardPath("STORY-1").split("/"));
    const before = await readFile(card, "utf8");
    await writeFile(card, `${before}\nA local change.\n`);
    const local = m.tip(FEATURE_BRANCH);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({
      remains: [SETTLE_NOTES.feature(FEATURE_BRANCH)],
    });
    expect((await w.gh.load()).prs[0]?.state).toBe("MERGED");
    expect(m.tip(FEATURE_BRANCH)).toBe(local);
    expect(isMerged(await w.read())).toBe(false);
    expect(m.treeExists()).toBe(true);
    await writeFile(card, before);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [AHEAD] });
    expect(m.treeExists()).toBe(false);
    expect(isMerged(onFeature())).toBe(true);
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

describe("GitHub refusing the merge for another reason (review fix)", { timeout: 60_000 }, () => {
  it("is an error, not a conflict: the story stays where it is and its session is told nothing", async () => {
    const why = "X Pull request acme/app#1 is not mergeable: the base branch policy prohibits the merge.";
    await m.start({ gh: { mergeFails: why } });
    await m.verified();
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(/base branch policy prohibits the merge/);
    const card = await w.read();
    expect(card.status).toBe("In Review");
    expect(isMerged(card)).toBe(false);
    expect(m.sent).toEqual([]);
    expect(m.treeExists()).toBe(true);
  });

  it("is an error when GitHub says it conflicts but git finds no files: nothing moves", async () => {
    const why = "X Pull request acme/app#1 is not mergeable: the merge commit cannot be cleanly created.";
    await m.start({ gh: { mergeFails: why } });
    await m.verified();
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(MERGE_MESSAGES.conflictUnknown("STORY-1"));
    const card = await w.read();
    expect(card.status).toBe("In Review");
    expect(isMerged(card)).toBe(false);
    expect(m.sent).toEqual([]);
    expect(m.treeExists()).toBe(true);
  });
});

describe("a local feature branch git can't count (review fix)", { timeout: 60_000 }, () => {
  it("merges without guessing how far ahead it is", async () => {
    await m.start();
    await m.verified();
    m.gitRun = async (command, root, args, options) =>
      args[0] === "rev-list" && args[1] === "--count"
        ? { code: 128, stdout: "", stderr: "fatal: bad revision\n" }
        : runGit(command, root, args, options);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [] });
    expectSettled();
  });
});
