/**
 * STORY-70: Approve, the review screen's one click that records the user's Accept and merges the feature to main.
 * Real feature end, accept, merge, settle, checks, PRs, scanner, card lane and work-format rules on a real repository;
 * GitHub is the fake `gh` over a bare remote, and the clock, the check command and the chat manager are the only other
 * stand-ins.
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evidenceState, FEATURE_END_MESSAGES } from "@featra/work-format";
import { ownedIn } from "../src/card-actions.ts";
import { SETTLE_NOTES } from "../src/merge-settle.ts";
import { checkRun } from "./fake-gh.ts";
import { FEATURE_BRANCH, featureWorld, LEAD, PR } from "./feature-end-world.ts";

const w = featureWorld();
const ID = "FEAT-1";
const dir = () => w.repo.main;
const approve = () => w.features.approve(dir(), ID);
const state = () => w.features.mergeState(dir(), ID);
const ci = { gh: { prs: [], next: 1 }, checks: "ci" as const };
const passing = () =>
  w.gh.change((s) => {
    for (const pr of s.prs) pr.checks = [checkRun("SUCCESS")];
  });
const accepts = (card = w.onFeature()) => card.history.filter((e) => e.field === "accepted");

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

describe("Approve without GitHub (AC1, AC5)", () => {
  it("records the Accept and merges with a merge commit at the commits judged, committing nothing first", async () => {
    await w.start({ remote: false });
    // The feature is finished, not accepted: its checks ran at its branch's commit all the same.
    expect(evidenceState(w.onFeature()).accepted).toBe(false);
    expect(w.features.checksFor(dir(), ID)?.last?.passed).toBe(true);
    expect(state()).toEqual({ mergeable: true, blocked: null });
    const base = w.tip("main");
    const tip = w.tip(FEATURE_BRANCH);
    await expect(approve()).resolves.toEqual({ remains: [] });
    expect(w.tip(FEATURE_BRANCH)).toBe(tip);
    expect(w.parents(dir(), "main")).toEqual([base, tip]);
    expect(existsSync(join(dir(), "feature.txt"))).toBe(true);
    const done = w.onMain();
    expect(done.status).toBe("done");
    expect(evidenceState(done).accepted).toBe(true);
    expect(accepts(done)).toEqual([expect.objectContaining({ by: "user" })]);
    expect(done.history.find((e) => e.field === "merged")).toMatchObject({ from: FEATURE_BRANCH, to: "main" });
    const scan = await w.watches.scan(dir());
    expect(ownedIn(scan, ID)?.owned.owner).toEqual({ kind: "main" });
    expect(ownedIn(scan, "STORY-1")?.owned.owner).toEqual({ kind: "main" });
  });
});

describe("Approve waits (AC2)", () => {
  it("is refused while a story is unfinished, and nothing is recorded or read", async () => {
    await w.start({ remote: false, story2: "In Progress" });
    expect(state()).toBeUndefined();
    const main = w.tip("main");
    await expect(approve()).rejects.toThrow(FEATURE_END_MESSAGES.unfinished(ID, 1));
    expect(evidenceState(w.onFeature()).accepted).toBe(false);
    expect(w.tip("main")).toBe(main);
  });

  it("is off with the checks' reason while they fail at the branch's commit", async () => {
    await w.start({ remote: false });
    await w.commitOn(FEATURE_BRANCH, "verdict.txt", "fail\n");
    await w.settle();
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.failed });
  });

  it("is off when main moved on, and the Dev Lead is told to merge main in", async () => {
    await w.start({ remote: false });
    await onMain("other.txt", "other\n");
    await w.settle();
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.behind("main") });
    expect(w.notices).toHaveLength(1);
    expect(w.notices[0]).toMatchObject({ chat: LEAD, notice: { story: ID, outcome: "behind main" } });
    expect(w.notices[0]?.notice.summary).toMatch(/Merge main into feature\/1-ship with a merge commit, never a rebase/);
  });
});

describe("a merge that fails after the Accept (AC4)", () => {
  it("keeps the Accept and says why; Merge to main is then the retry, once main is merged in", async () => {
    await w.start({ remote: false });
    // Main moves on as Approve enters the lane: the merge is refused, after the Accept.
    w.beforeLane = () => onMain("other.txt", "other\n");
    const main = w.tip("main");
    await expect(approve()).rejects.toThrow(FEATURE_END_MESSAGES.moved("main"));
    expect(w.parents(dir(), "main")).toEqual([main]);
    expect(evidenceState(w.onFeature()).accepted).toBe(true);
    expect(accepts()).toHaveLength(1);
    await w.settle();
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.behind("main") });
    expect(w.notices.map((n) => n.notice.outcome)).toEqual(["behind main"]);
    // The retry: Approve again is refused (accepted already); Merge to main merges once main is in.
    await expect(approve()).rejects.toThrow(FEATURE_END_MESSAGES.accepted(ID));
    mergeMainIn();
    await w.settle();
    expect(state()).toEqual({ mergeable: true, blocked: null });
    const tip = w.tip(FEATURE_BRANCH);
    await expect(w.features.merge(dir(), ID)).resolves.toEqual({ remains: [] });
    expect(w.parents(dir(), "main")[1]).toBe(tip);
    const done = w.onMain();
    expect(done.status).toBe("done");
    expect(accepts(done)).toHaveLength(1);
  });

  it("keeps the Accept when the checks failed by the click (a screen that hadn't heard yet)", async () => {
    await w.start({ remote: false });
    await w.commitOn(FEATURE_BRANCH, "verdict.txt", "fail\n");
    await w.settle();
    await expect(approve()).rejects.toThrow(FEATURE_END_MESSAGES.failed);
    expect(evidenceState(w.onFeature()).accepted).toBe(true);
    expect(w.onMain().status).not.toBe("done");
  });
});

describe("Approve through the feature's PR (AC1, AC2, AC5)", () => {
  it("opens the feature's PR once it is finished, before any Accept, so its CI runs first", async () => {
    await w.start(ci);
    const [pr] = (await w.gh.load()).prs;
    expect(pr).toMatchObject({ url: PR, head: FEATURE_BRANCH, base: "main", state: "OPEN" });
    expect(w.onFeature().pr).toBe(PR);
    expect(evidenceState(w.onFeature()).accepted).toBe(false);
    expect(w.remoteGit("rev-parse", FEATURE_BRANCH)).toBe(w.tip(FEATURE_BRANCH));
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.pending });
  });

  it("doesn't open it while a story is unfinished", async () => {
    await w.start({ ...ci, story2: "In Progress" });
    expect((await w.gh.load()).prs).toEqual([]);
    expect(state()).toBeUndefined();
  });

  it("merges the PR with a merge commit at the commit CI passed on, then main has the feature Done with the Accept", async () => {
    await w.start(ci);
    await passing();
    await w.poll();
    expect(state()).toEqual({ mergeable: true, blocked: null });
    const base = w.remoteGit("rev-parse", "main");
    const tip = w.tip(FEATURE_BRANCH);
    await expect(approve()).resolves.toEqual({ remains: [SETTLE_NOTES.ahead("main", 1)] });
    expect(w.tip(FEATURE_BRANCH)).toBe(tip);
    expect(await w.callsOf("pr merge")).toEqual([["pr", "merge", PR, "--merge", "--match-head-commit", tip]]);
    const merge = w.remoteGit("rev-parse", "main");
    expect(w.parents(w.remote, merge)).toEqual([base, tip]);
    expect(w.parents(dir(), "main")).toEqual([merge]);
    const done = w.onMain();
    expect(done.status).toBe("done");
    expect(done.pr).toBe(PR);
    expect(accepts(done)).toEqual([expect.objectContaining({ by: "user" })]);
  });

  it("keeps the Accept when GitHub refuses the merge, says why, and Merge to main retries", async () => {
    await w.start(ci);
    await passing();
    await w.poll();
    await w.gh.change((s) => {
      s.mergeFails = "Base branch was modified.";
    });
    await expect(approve()).rejects.toThrow(/^Couldn't merge the PR: base branch was modified\.$/);
    expect(evidenceState(w.onFeature()).accepted).toBe(true);
    expect(w.onMain().status).not.toBe("done");
    // The Accept is a commit on the branch: it is pushed and CI runs again at it.
    await w.gh.change((s) => {
      delete s.mergeFails;
    });
    await w.settle();
    await passing();
    await w.poll();
    expect(state()).toEqual({ mergeable: true, blocked: null });
    await expect(w.features.merge(dir(), ID)).resolves.toBeTruthy();
    expect(w.onMain().status).toBe("done");
    expect(accepts(w.onMain())).toHaveLength(1);
  });

  it("settles later, with the Accept, when the PR merged but main couldn't take the Done card then", async () => {
    await w.start(ci);
    await passing();
    await w.poll();
    // GitHub can't be fetched from once the merge is under way (the network drops): main can't take the Done card.
    const gone = join(w.repo.root, "gone", "github.com", "acme", "app.git").replace(/\\/g, "/");
    w.beforeLane = async () => void w.repo.git(dir(), "remote", "set-url", "origin", gone);
    await expect(approve()).resolves.toEqual({ remains: [SETTLE_NOTES.feature("main")] });
    expect((await w.gh.load()).prs[0]?.state).toBe("MERGED");
    expect(w.onMain().status).not.toBe("done");
    expect(evidenceState(w.onFeature()).accepted).toBe(false);
    w.repo.git(dir(), "remote", "set-url", "origin", w.remote);
    await w.poll();
    const done = w.onMain();
    expect(done.status).toBe("done");
    expect(accepts(done)).toEqual([expect.objectContaining({ by: "user" })]);
  });

  it("doesn't settle a PR merged on GitHub before the user approved it", async () => {
    await w.start(ci);
    const base = w.remoteGit("rev-parse", "main");
    const head = w.remoteGit("rev-parse", FEATURE_BRANCH);
    const tree = w.remoteGit("merge-tree", "--write-tree", base, head).split("\n")[0]!;
    const merge = w.remoteGit("commit-tree", tree, "-p", base, "-p", head, "-m", "Merge pull request #1");
    w.remoteGit("update-ref", "refs/heads/main", merge, base);
    await w.gh.change((s) => {
      s.prs[0]!.state = "MERGED";
    });
    await w.poll();
    expect(w.onMain().status).not.toBe("done");
    expect(evidenceState(w.onFeature()).accepted).toBe(false);
    expect(state()).toBeUndefined();
  });
});
