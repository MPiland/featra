/**
 * STORY-14 without GitHub: Accept a feature once its stories are finished, its checks at the commit its branch is at
 * (run here in a temporary worktree), the base moving on, and Merge to main as a merge commit made by git. Real feature
 * end, merge, checks, scanner, card lane and work-format rules on a real repository; the clock, the check command and
 * the chat manager are the only stand-ins.
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evidenceState, FEATURE_END_MESSAGES } from "@featra/work-format";
import { cardViewIn, ownedIn } from "../src/card-actions.ts";
import { MERGE_NOTES } from "../src/feature-merge.ts";
import { FEATURE_BRANCH, featureWorld, LEAD } from "./feature-end-world.ts";

const w = featureWorld();
const ID = "FEAT-1";
const dir = () => w.repo.main;
const accept = () => w.features.accept(dir(), ID);
const merge = () => w.features.merge(dir(), ID);
const state = () => w.features.mergeState(dir(), ID);

/** FEAT-1's card pane, as the server builds it. */
async function view() {
  const scan = await w.watches.scan(dir());
  const f = w.features;
  return cardViewIn(scan, ID, f.checksFor(dir(), ID), f.prState(dir(), ID), f.mergeState(dir(), ID));
}

/** A commit on main, which is checked out. */
async function onMain(file: string, text: string) {
  await writeFile(join(dir(), file), text);
  w.repo.commit(dir(), `main: ${file}`);
}

/** The Dev Lead merges main into the feature branch with a merge commit, as it is told to. */
function mergeMainIn() {
  const tree = join(w.repo.root, "lead");
  w.repo.git(dir(), "worktree", "add", "-q", tree, FEATURE_BRANCH);
  w.repo.git(tree, "merge", "-q", "--no-edit", "-X", "theirs", "main");
  w.repo.git(dir(), "worktree", "remove", "--force", tree);
}

describe("Accept on a feature (AC1)", { timeout: 60_000 }, () => {
  it("is refused while a story under it isn't finished, and isn't offered", async () => {
    await w.start({ story2: "In Progress" });
    expect((await view())?.featureEnd).toEqual({
      acceptable: false,
      accepted: false,
      mergeable: false,
      blocked: null,
      base: "main",
    });
    await expect(accept()).rejects.toThrow(FEATURE_END_MESSAGES.unfinished(ID, 1));
    expect(evidenceState(w.onFeature()).accepted).toBe(false);
  });

  it("is offered once every story is Done or Cancelled, and records the user's Accept on the feature branch", async () => {
    await w.start({ remote: false, story2: "Cancelled" });
    expect((await view())?.featureEnd?.acceptable).toBe(true);
    await expect(accept()).resolves.toBeNull();
    const card = w.onFeature();
    expect(evidenceState(card).accepted).toBe(true);
    expect(card.history.at(-1)).toMatchObject({ field: "accepted", by: "user" });
    // Main is untouched: the feature's card lives on its branch until it merges.
    expect(evidenceState(w.onMain()).accepted).toBe(false);
    await w.settle();
    expect((await view())?.featureEnd).toMatchObject({ acceptable: false, accepted: true });
  });

  it("is refused twice", async () => {
    await w.start();
    await accept();
    await expect(accept()).rejects.toThrow(FEATURE_END_MESSAGES.accepted(ID));
  });
});

describe("local mode (AC2)", { timeout: 60_000 }, () => {
  it("opens no PR and offers no Create PR", async () => {
    await w.start({ remote: false });
    await accept();
    await w.settle();
    expect(w.onFeature().pr).toBeNull();
    expect(await w.gh.calls()).toEqual([]);
    expect((await view())?.prState).toBeUndefined();
  });
});

describe("Merge to main without GitHub (AC3, AC5)", { timeout: 60_000 }, () => {
  it("is refused before Accept", async () => {
    await w.start({ remote: false });
    await expect(merge()).rejects.toThrow(FEATURE_END_MESSAGES.notAccepted(ID));
  });

  it("waits for the feature's checks, run at its branch's commit, then merges with a merge commit", async () => {
    await w.start({ remote: false });
    await accept();
    await w.settle();
    expect(w.features.checksFor(dir(), ID)?.last?.passed).toBe(true);
    expect(state()).toEqual({ mergeable: true, blocked: null });
    // The checks ran in a worktree of their own, gone now: the project lists only main.
    expect(w.repo.git(dir(), "worktree", "list").trim().split("\n")).toHaveLength(1);
    const base = w.tip("main");
    const tip = w.tip(FEATURE_BRANCH);
    await expect(merge()).resolves.toEqual({ remains: [] });
    expect(w.parents(dir(), "main")).toEqual([base, tip]);
    expect(existsSync(join(dir(), "feature.txt"))).toBe(true);
    const done = w.onMain();
    expect(done.status).toBe("done");
    expect(done.history.find((e) => e.field === "merged")).toMatchObject({ from: FEATURE_BRANCH, to: "main" });
    // Main owns the feature and its cards now.
    const scan = await w.watches.scan(dir());
    expect(ownedIn(scan, ID)?.owned.owner).toEqual({ kind: "main" });
    expect(ownedIn(scan, "STORY-1")?.owned.owner).toEqual({ kind: "main" });
    expect((await view())?.featureEnd).toBeUndefined();
  });

  it("stays off while the checks fail at the branch's commit, and the merge is refused", async () => {
    await w.start({ remote: false });
    await w.commitOn(FEATURE_BRANCH, "verdict.txt", "fail\n");
    await accept();
    await w.settle();
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.failed });
    await expect(merge()).rejects.toThrow(FEATURE_END_MESSAGES.failed);
    expect(w.onMain().status).toBe("active");
  });

  it("leaves main alone when its checkout has a local change the merge would overwrite", async () => {
    await w.start({ remote: false });
    await accept();
    await w.settle();
    const base = w.tip("main");
    // The merge brings feature.txt; main's checkout has its own, uncommitted (review Should-fix 2: the overlap).
    await writeFile(join(dir(), "feature.txt"), "unsaved\n");
    await w.poll();
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.baseBusy("main") });
    await expect(merge()).rejects.toThrow(FEATURE_END_MESSAGES.baseBusy("main"));
    expect(w.tip("main")).toBe(base);
  });

  it("says a checkout of the feature branch keeps its cards there", async () => {
    await w.start({ remote: false });
    const tree = w.repo.worktree("unused", "unused", "main");
    w.repo.git(tree, "checkout", "-q", FEATURE_BRANCH);
    await accept();
    await w.settle();
    // An accept written to the checkout's file is committed by the user, as every card edit there is.
    w.repo.commit(tree, "accept");
    await w.settle();
    await expect(merge()).resolves.toEqual({ remains: [MERGE_NOTES.checkedOut(FEATURE_BRANCH, "main")] });
    expect(w.onMain().status).toBe("done");
  });
});

describe("when main moves on (AC4)", { timeout: 60_000 }, () => {
  it("turns Merge to main off and tells the Dev Lead to merge main in, once per main commit", async () => {
    await w.start({ remote: false });
    await accept();
    await w.settle();
    await onMain("other.txt", "other\n");
    await w.poll();
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.behind("main") });
    await expect(merge()).rejects.toThrow(FEATURE_END_MESSAGES.behind("main"));
    await w.poll();
    expect(w.notices).toHaveLength(1);
    expect(w.notices[0]).toMatchObject({ chat: LEAD, notice: { story: ID, outcome: "behind main" } });
    expect(w.notices[0]?.notice.summary).toMatch(/Merge main into feature\/1-ship with a merge commit, never a rebase/);
    await onMain("more.txt", "more\n");
    await w.poll();
    expect(w.notices).toHaveLength(2);
  });

  it("waits for passing checks on the merged tip, then merges", async () => {
    await w.start({ remote: false });
    await accept();
    await w.settle();
    await onMain("other.txt", "other\n");
    await w.poll();
    mergeMainIn();
    await w.poll();
    expect(w.features.checksFor(dir(), ID)?.last?.passed).toBe(true);
    expect(state()).toEqual({ mergeable: true, blocked: null });
    await merge();
    expect(w.onMain().status).toBe("done");
  });

  it("names the files that conflict", async () => {
    await w.start({ remote: false });
    await accept();
    await w.settle();
    await onMain("feature.txt", "main's own\n");
    await w.poll();
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.conflicts("main") });
    expect(w.notices[0]?.notice.summary).toMatch(/These files conflict: feature\.txt\./);
  });
});
