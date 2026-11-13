/**
 * STORY-14 with GitHub usable: Accept opens the feature's PR to main when "Open feature PRs automatically" is on, Create
 * PR does when it is off, Merge to main merges the PR with a merge commit once CI passes at the branch's commit, and a
 * PR merged on GitHub outside Featra is noticed. Real feature end, PRs, merge, settle, poller, scanner, card lane and
 * work-format rules on a real repository; GitHub is the fake `gh` over a bare remote, and the clock and the chat
 * manager are faked.
 */
import { describe, expect, it } from "vitest";
import { evidenceState, FEATURE_END_MESSAGES } from "@featra/work-format";
import { ownedIn } from "../src/card-actions.ts";
import { SETTLE_NOTES } from "../src/merge-settle.ts";
import { checkRun } from "./fake-gh.ts";
import { FEATURE_BRANCH, featureWorld, PR } from "./feature-end-world.ts";

const w = featureWorld();
const ID = "FEAT-1";
const dir = () => w.repo.main;
const state = () => w.features.mergeState(dir(), ID);
const ci = { gh: { prs: [], next: 1 }, checks: "ci" as const };
const passing = async () =>
  w.gh.change((s) => {
    for (const pr of s.prs) pr.checks = [checkRun("SUCCESS")];
  });

describe("the feature's PR (AC2)", { timeout: 60_000 }, () => {
  it("opens to main as Accept pushes the feature branch, when feature PRs open automatically", async () => {
    await w.start(ci);
    await w.features.accept(dir(), ID);
    const [pr] = (await w.gh.load()).prs;
    expect(pr).toMatchObject({ url: PR, head: FEATURE_BRANCH, base: "main", state: "OPEN" });
    const card = w.onFeature();
    expect(card.pr).toBe(PR);
    expect(evidenceState(card).accepted).toBe(true);
    await w.settle();
    // The accept's own commit is pushed too: GitHub's branch is where the local one is.
    expect(w.remoteGit("rev-parse", FEATURE_BRANCH)).toBe(w.tip(FEATURE_BRANCH));
  });

  it("isn't opened when that is off: the feature offers Create PR, which opens it", async () => {
    await w.start({ ...ci, yaml: "openFeaturePrs: false\n" });
    await w.features.accept(dir(), ID);
    await w.settle();
    expect((await w.gh.load()).prs).toEqual([]);
    expect(w.onFeature().pr).toBeNull();
    expect(w.features.prState(dir(), ID)).toMatchObject({ create: true, opening: false });
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.noPr });
    await expect(w.features.createPr(dir(), ID)).resolves.toBeNull();
    expect(w.onFeature().pr).toBe(PR);
    expect((await w.gh.load()).prs[0]).toMatchObject({ head: FEATURE_BRANCH, base: "main" });
  });

  it("isn't offered before Accept", async () => {
    await w.start({ ...ci, yaml: "openFeaturePrs: false\n" });
    await expect(w.features.createPr(dir(), ID)).rejects.toThrow(FEATURE_END_MESSAGES.notAccepted(ID));
    expect(w.features.prState(dir(), ID)).toBeUndefined();
  });
});

describe("Merge to main through the PR (AC3, AC5)", { timeout: 60_000 }, () => {
  it("waits for CI at the branch's commit, then merges the PR with a merge commit and makes the feature Done", async () => {
    await w.start(ci);
    await w.features.accept(dir(), ID);
    await w.settle();
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.pending });
    await passing();
    await w.poll();
    expect(state()).toEqual({ mergeable: true, blocked: null });
    const base = w.remoteGit("rev-parse", "main");
    const tip = w.tip(FEATURE_BRANCH);
    await expect(w.features.merge(dir(), ID)).resolves.toEqual({ remains: [SETTLE_NOTES.ahead("main", 1)] });
    const [call] = await w.callsOf("pr merge");
    expect(call).toEqual(["pr", "merge", PR, "--merge", "--match-head-commit", tip]);
    const merge = w.remoteGit("rev-parse", "main");
    expect(w.parents(w.remote, merge)).toEqual([base, tip]);
    // The Done card is a commit on local main, on top of GitHub's merge commit.
    expect(w.parents(dir(), "main")).toEqual([merge]);
    const done = w.onMain();
    expect(done.status).toBe("done");
    expect(done.pr).toBe(PR);
    const scan = await w.watches.scan(dir());
    expect(ownedIn(scan, ID)?.owned.owner).toEqual({ kind: "main" });
    expect(ownedIn(scan, "STORY-1")?.owned.owner).toEqual({ kind: "main" });
  });

  it("stays off while CI fails", async () => {
    await w.start(ci);
    await w.features.accept(dir(), ID);
    await w.gh.change((s) => {
      for (const pr of s.prs) pr.checks = [checkRun("FAILURE")];
    });
    await w.poll();
    expect(state()).toEqual({ mergeable: false, blocked: FEATURE_END_MESSAGES.failed });
    await expect(w.features.merge(dir(), ID)).rejects.toThrow(FEATURE_END_MESSAGES.failed);
    expect(await w.callsOf("pr merge")).toEqual([]);
  });

  it("notices a PR merged on GitHub outside Featra, and settles it the same way", async () => {
    await w.start(ci);
    await w.features.accept(dir(), ID);
    await w.settle();
    const base = w.remoteGit("rev-parse", "main");
    const head = w.remoteGit("rev-parse", FEATURE_BRANCH);
    const tree = w.remoteGit("merge-tree", "--write-tree", base, head).split("\n")[0]!;
    const merge = w.remoteGit("commit-tree", tree, "-p", base, "-p", head, "-m", "Merge pull request #1");
    w.remoteGit("update-ref", "refs/heads/main", merge, base);
    await w.gh.change((s) => {
      s.prs[0]!.state = "MERGED";
    });
    await w.poll();
    expect(await w.callsOf("pr merge")).toEqual([]);
    expect(w.parents(dir(), "main")).toEqual([merge]);
    expect(w.onMain().status).toBe("done");
  });
});
