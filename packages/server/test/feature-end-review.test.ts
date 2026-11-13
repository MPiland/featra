/**
 * STORY-14 review regressions: Merge to main goes ahead only at the commits its facts were judged at, a PR merged on
 * GitHub outside Featra settles once and only at the branch's commit, main's checkout blocks a merge only with a local
 * change the merge would overwrite (found before anything is done), the Dev Lead's notice counts once posted, and the
 * paths a failure leaves (Accept's card write, a check run that fails or hangs, GitHub ahead). Real feature end, merge,
 * checks, PRs, scanner, card lane and work-format rules on a real repository; GitHub is the fake `gh` over a bare
 * remote, and the clock, the check command and the chat manager are faked.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evidenceState, FEATURE_END_MESSAGES, GITHUB_COPY } from "@featra/work-format";
import { SETTLE_NOTES } from "../src/merge-settle.ts";
import { card, cardPath } from "./card-repo.ts";
import { checkRun } from "./fake-gh.ts";
import { FEATURE_BRANCH, featureWorld, LEAD, PR } from "./feature-end-world.ts";

const w = featureWorld();
const ID = "FEAT-1";
const dir = () => w.repo.main;
const accept = () => w.features.accept(dir(), ID);
const merge = () => w.features.merge(dir(), ID);
const state = () => w.features.mergeState(dir(), ID);
const ci = { gh: { prs: [], next: 1 }, checks: "ci" as const };
const m = FEATURE_END_MESSAGES;

/** The feature branch's ref file in the main checkout's repository. */
const ref = () => join(dir(), ".git", "refs", "heads", ...FEATURE_BRANCH.split("/"));

/** CI passes on every head of every PR. */
const passing = () =>
  w.gh.change((s) => {
    for (const pr of s.prs) pr.checks = [checkRun("SUCCESS")];
  });

/** A commit on main, which is checked out. */
async function onMain(file: string, text: string) {
  await writeFile(join(dir(), file), text);
  w.repo.commit(dir(), `main: ${file}`);
}

/** Accepted, checked and mergeable: on GitHub with CI passing when `github`, else with local checks. */
async function mergeable(github: boolean) {
  await w.start(github ? ci : { remote: false });
  await accept();
  await w.settle();
  if (github) await passing();
  await w.poll();
  expect(state()).toEqual({ mergeable: true, blocked: null });
}

/** The feature's PR merged on GitHub by someone else, at the branch's tip there. */
async function mergedOnGithub() {
  const base = w.remoteGit("rev-parse", "main");
  const head = w.remoteGit("rev-parse", FEATURE_BRANCH);
  const tree = w.remoteGit("merge-tree", "--write-tree", base, head).split("\n")[0]!;
  const merged = w.remoteGit("commit-tree", tree, "-p", base, "-p", head, "-m", "Merge pull request #1");
  w.remoteGit("update-ref", "refs/heads/main", merged, base);
  await w.gh.change((s) => {
    s.prs[0]!.state = "MERGED";
  });
}

describe("the branch moving between the checks and the merge (review B1)", { timeout: 60_000 }, () => {
  it("is refused without GitHub, and main is untouched", async () => {
    await mergeable(false);
    const base = w.tip("main");
    w.beforeLane = () => w.commitOn(FEATURE_BRANCH, "late.txt", "never checked\n");
    await expect(merge()).rejects.toThrow(m.moved(FEATURE_BRANCH));
    expect(w.tip("main")).toBe(base);
    expect(w.onMain().status).toBe("active");
  });

  it("is refused on GitHub before the PR merges, even once GitHub has the new commit", async () => {
    await mergeable(true);
    const base = w.remoteGit("rev-parse", "main");
    w.beforeLane = async () => {
      await w.commitOn(FEATURE_BRANCH, "late.txt", "never checked\n");
      w.repo.git(dir(), "push", "-q", "origin", FEATURE_BRANCH);
    };
    await expect(merge()).rejects.toThrow(m.moved(FEATURE_BRANCH));
    expect(await w.callsOf("pr merge")).toEqual([]);
    expect(w.remoteGit("rev-parse", "main")).toBe(base);
  });
});

describe("a PR merged on GitHub outside Featra (review B2)", { timeout: 60_000 }, () => {
  it("settles once, says main is ahead of GitHub, and later reads commit nothing more", async () => {
    await w.start(ci);
    await accept();
    await w.settle();
    await mergedOnGithub();
    await w.poll();
    expect(w.onMain().status).toBe("done");
    const settled = w.tip("main");
    expect(w.notices).toContainEqual({
      chat: LEAD,
      notice: { story: ID, outcome: "merged", summary: SETTLE_NOTES.ahead("main", 1) },
    });
    await w.poll();
    await w.poll();
    expect(w.tip("main")).toBe(settled);
  });

  it("isn't settled when it merged without this computer's latest commits, and says so on every read", async () => {
    await w.start(ci);
    await accept();
    await w.settle();
    await mergedOnGithub();
    await w.commitOn(FEATURE_BRANCH, "late.txt", "not on GitHub\n");
    const base = w.tip("main");
    await w.poll();
    expect(state()).toEqual({ mergeable: false, blocked: m.prMergedBehind });
    await w.poll();
    await w.poll();
    expect(w.tip("main")).toBe(base);
    expect(w.onMain().status).toBe("active");
    await expect(merge()).rejects.toThrow(m.prMergedBehind);
  });
});

describe("main's checkout (review Should-fix 2)", { timeout: 60_000 }, () => {
  it("merges with Featra's own uncommitted edit to a card main owns", async () => {
    await w.repo.write(dir(), card("STORY-9", "story", null, "New"));
    w.repo.commit(dir(), "a card main owns");
    await mergeable(false);
    await w.repo.write(dir(), card("STORY-9", "story", null, "New", { title: "Edited, not committed" }));
    await expect(merge()).resolves.toEqual({ remains: [] });
    expect(w.onMain().status).toBe("done");
    expect(w.repo.git(dir(), "status", "--porcelain")).toContain(cardPath("STORY-9"));
  });

  it("refuses on GitHub before the PR merges when a local change is in the way", async () => {
    await mergeable(true);
    const base = w.remoteGit("rev-parse", "main");
    await writeFile(join(dir(), "feature.txt"), "unsaved\n");
    await w.poll();
    expect(state()).toEqual({ mergeable: false, blocked: m.baseBusy("main") });
    await expect(merge()).rejects.toThrow(m.baseBusy("main"));
    expect(await w.callsOf("pr merge")).toEqual([]);
    expect(w.remoteGit("rev-parse", "main")).toBe(base);
  });
});

describe("the Dev Lead's notice (review Should-fix 4)", { timeout: 60_000 }, () => {
  it("counts as told only once it is posted, so a failed post is tried again", async () => {
    await w.start({ remote: false });
    await accept();
    await w.settle();
    // Every post fails while main moves on, and then the chat takes them again.
    w.notifyFails = 1000;
    await onMain("other.txt", "other\n");
    await w.poll();
    expect(w.notices).toEqual([]);
    w.notifyFails = 0;
    await w.poll();
    expect(w.notices).toHaveLength(1);
    expect(w.notices[0]).toMatchObject({ chat: LEAD, notice: { story: ID, outcome: "behind main" } });
  });

  it("is dropped when no Dev Lead leads the feature, and Merge to main still says why it waits", async () => {
    await w.start({ remote: false, lead: false });
    await accept();
    await w.settle();
    await onMain("other.txt", "other\n");
    await w.poll();
    expect(w.notices).toEqual([]);
    expect(state()).toEqual({ mergeable: false, blocked: m.behind("main") });
  });
});

describe("what a failure leaves (review Should-fix 5)", { timeout: 60_000 }, () => {
  it("lets Accept be tried again after its PR opened and its card write failed, adopting that PR", async () => {
    // While GitHub opens the PR, the feature branch can't be read, so Accept's card write fails.
    await w.start(ci);
    await w.gh.change((s) => {
      s.whileCreating = { file: ref(), text: `${"0".repeat(40)}\n` };
    });
    const tip = w.tip(FEATURE_BRANCH);
    await expect(accept()).rejects.toThrow(/./);
    await writeFile(ref(), `${tip}\n`);
    expect(evidenceState(w.onFeature()).accepted).toBe(false);
    expect((await w.gh.load()).prs).toHaveLength(1);
    await expect(accept()).resolves.toBeNull();
    const accepted = w.onFeature();
    expect(evidenceState(accepted).accepted).toBe(true);
    expect(accepted.pr).toBe(PR);
    expect((await w.gh.load()).prs).toHaveLength(1);
  });

  it("removes the checks' worktree after a failed run", async () => {
    await w.start({ remote: false });
    await w.commitOn(FEATURE_BRANCH, "verdict.txt", "fail\n");
    await accept();
    await w.settle();
    expect(w.features.checksFor(dir(), ID)?.last?.passed).toBe(false);
    expect(w.repo.git(dir(), "worktree", "list").trim().split("\n")).toHaveLength(1);
  });

  it("removes the checks' worktree after a run that hangs and is stopped", async () => {
    await w.start({ remote: false, checkTimeoutMs: 1500 });
    await w.commitOn(FEATURE_BRANCH, "verdict.txt", "hang\n");
    await accept();
    await w.settle();
    expect(w.features.checksFor(dir(), ID)?.last?.passed).toBe(false);
    expect(state()).toEqual({ mergeable: false, blocked: m.failed });
    expect(w.repo.git(dir(), "worktree", "list").trim().split("\n")).toHaveLength(1);
  });

  it("blocks without pushing when GitHub's copy of the branch has commits this computer doesn't", async () => {
    await w.start(ci);
    await accept();
    await w.settle();
    const local = w.tip(FEATURE_BRANCH);
    const tree = w.remoteGit("rev-parse", `${FEATURE_BRANCH}^{tree}`);
    const there = w.remoteGit("commit-tree", tree, "-p", FEATURE_BRANCH, "-m", "On GitHub only");
    w.remoteGit("update-ref", `refs/heads/${FEATURE_BRANCH}`, there);
    await w.poll();
    expect(state()).toEqual({ mergeable: false, blocked: m.remoteAhead(FEATURE_BRANCH) });
    expect(w.remoteGit("rev-parse", FEATURE_BRANCH)).toBe(there);
    expect(w.tip(FEATURE_BRANCH)).toBe(local);
  });

  it("doesn't count a passed run at the same commit once the check command changes (review nit)", async () => {
    await mergeable(false);
    const tip = w.tip(FEATURE_BRANCH);
    await w.settings.set(dir(), { command: 'node -e "process.exit(1)"' });
    await w.poll();
    await w.settle();
    expect(w.tip(FEATURE_BRANCH)).toBe(tip);
    expect(state()).toEqual({ mergeable: false, blocked: m.failed });
    await expect(merge()).rejects.toThrow(m.failed);
  });

  it("gives Create PR in local mode the reason it has none", async () => {
    await w.start({ remote: false });
    await accept();
    await expect(w.features.createPr(dir(), ID)).rejects.toThrow(GITHUB_COPY.noRemote);
  });
});
