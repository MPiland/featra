/**
 * STORY-11 AC1, AC2: Featra tells whether GitHub is usable for a project, and a story moving into review has its branch
 * pushed and its PR opened through the user's `gh` (or adopts the open one); with the setting off, the card offers
 * Create PR instead. Real repository, watches, lane and rules; GitHub, the remote and the clock are faked.
 */
import { describe, expect, it } from "vitest";
import { GITHUB_COPY } from "@featra/work-format";
import { detectGithubUse } from "../src/github-detect.ts";
import { PR_REFUSALS } from "../src/story-prs.ts";
import { FEATURE_BRANCH, prWorld, STORY_BRANCH } from "./story-prs-world.ts";

const w = prWorld();
const prOf = () => w.prs.prState(w.repo.main, "STORY-1");

describe("GitHub usable or local mode (AC1)", { timeout: 60_000 }, () => {
  it("is usable with a GitHub remote and a signed-in gh", async () => {
    await w.start();
    expect(await detectGithubUse(w.repo.main, { ghCommand: w.gh.command })).toEqual({ usable: true, missing: null });
    expect((await w.settings.load(w.repo.main)).github).toEqual({ usable: true, missing: null });
  });

  it("says in one line what is missing: the remote, gh, or its sign-in", async () => {
    await w.start({ remote: false, gh: { signedIn: false } });
    expect(await detectGithubUse(w.repo.main, { ghCommand: w.gh.command })).toEqual({
      usable: false,
      missing: GITHUB_COPY.noRemote,
    });
    w.repo.git(w.repo.main, "remote", "add", "origin", w.remote);
    expect(await detectGithubUse(w.repo.main, { ghCommand: "gh-that-is-not-installed" })).toEqual({
      usable: false,
      missing: GITHUB_COPY.noGh,
    });
    expect(await detectGithubUse(w.repo.main, { ghCommand: w.gh.command })).toEqual({
      usable: false,
      missing: GITHUB_COPY.signedOut,
    });
    // Only the exit code of `gh auth status` is read; nothing it prints is kept.
    expect(await w.callsOf("auth status")).toEqual([["auth", "status", "--hostname", "github.com"]]);
  });

  it("shows the missing line in Project settings and does nothing in local mode", async () => {
    await w.start({ gh: { signedIn: false } });
    expect((await w.settings.load(w.repo.main)).github).toEqual({ usable: false, missing: GITHUB_COPY.signedOut });
    await w.move("In Review");
    expect(w.remoteBranches()).toEqual([]);
    expect((await w.read()).pr).toBeNull();
    expect(prOf()).toBeUndefined();
    expect(await w.callsOf("api")).toEqual([]);
    await expect(w.prs.createPr(w.repo.main, "STORY-1")).rejects.toThrow(GITHUB_COPY.signedOut);
  });
});

describe("a story moving into review (AC2)", { timeout: 60_000 }, () => {
  it("pushes its branch and opens its PR against the feature branch, recorded by system", async () => {
    await w.start();
    expect(prOf()).toBeUndefined();
    await w.move("In Review");
    expect(w.remoteBranches()).toEqual(expect.arrayContaining([FEATURE_BRANCH, STORY_BRANCH]));
    const [created] = await w.callsOf("api");
    expect(created).toEqual(["api", "repos/{owner}/{repo}/pulls", "--method", "POST", "--input", "-"]);
    const [pr] = (await w.gh.load()).prs;
    expect(pr).toMatchObject({ head: STORY_BRANCH, base: FEATURE_BRANCH, title: "STORY-1: Open a PR" });
    expect(pr?.body).toContain("As a user, I want a PR.");
    expect(pr?.body).toContain("- [ ] It opens");
    const story = await w.read();
    expect(story.pr).toBe("https://github.com/acme/app/pull/1");
    expect(story.history.at(-1)).toMatchObject({ field: "pr", to: story.pr, by: "system" });
    expect(story.history.filter((e) => e.field === "pr")).toHaveLength(1);
    expect(prOf()).toMatchObject({ status: { state: "open" }, create: false, opening: false, note: null });
  });

  it("adopts the open PR from the story's branch instead of opening another", async () => {
    const url = "https://github.com/acme/app/pull/14";
    await w.start({ gh: { prs: [{ number: 14, url, head: STORY_BRANCH, state: "OPEN" }], next: 15 } });
    await w.move("In Review");
    expect(await w.callsOf("api")).toEqual([]);
    expect((await w.read()).pr).toBe(url);
  });

  it("leaves the stories already in review when Featra starts alone", async () => {
    await w.start({ status: "In Review" });
    expect(w.remoteBranches()).toEqual([]);
    expect((await w.read()).pr).toBeNull();
    // It can still be opened by hand.
    expect(prOf()).toMatchObject({ create: true });
  });

  it("with the setting off pushes nothing and offers Create PR, which opens it", async () => {
    await w.start({ yaml: "openStoryPrs: false\n" });
    await w.move("In Review");
    expect(w.remoteBranches()).toEqual([]);
    expect(prOf()).toEqual({ status: null, create: true, opening: false, note: null });
    await w.prs.createPr(w.repo.main, "STORY-1");
    await w.settle();
    expect(w.remoteBranches()).toEqual(expect.arrayContaining([STORY_BRANCH]));
    expect((await w.read()).pr).toBe("https://github.com/acme/app/pull/1");
    expect(prOf()).toMatchObject({ create: false, status: { state: "open" } });
  });

  it("refuses Create PR outside review and when the story has a PR", async () => {
    await w.start({ yaml: "openStoryPrs: false\n" });
    expect(prOf()).toBeUndefined();
    await expect(w.prs.createPr(w.repo.main, "STORY-1")).rejects.toThrow(PR_REFUSALS.notReady);
    await w.move("In Review", { pr: "https://github.com/acme/app/pull/3" });
    await expect(w.prs.createPr(w.repo.main, "STORY-1")).rejects.toThrow(PR_REFUSALS.hasPr);
  });

  it("shows why it couldn't open the PR on the card and offers Create PR again", async () => {
    await w.start({ gh: { createFails: "HTTP 403: Resource not accessible" } });
    await w.move("In Review");
    expect((await w.read()).pr).toBeNull();
    expect(prOf()).toEqual({
      status: null,
      create: true,
      opening: false,
      note: "Couldn't open the PR: HTTP 403: Resource not accessible",
    });
    await w.gh.change((s) => delete s.createFails);
    await w.prs.createPr(w.repo.main, "STORY-1");
    await w.settle();
    expect(prOf()).toMatchObject({ note: null, status: { state: "open" } });
  });

  it("never forces a push: a remote branch that moved on stops it with git's reason", async () => {
    await w.start();
    // The remote's copy of the story branch has a commit the worktree doesn't.
    await w.repo.commitOn(FEATURE_BRANCH, async () => {}, "elsewhere");
    w.repo.git(w.repo.main, "push", "-q", "origin", `${FEATURE_BRANCH}:${STORY_BRANCH}`);
    await w.move("In Review");
    expect(prOf()?.note).toMatch(/^Couldn't push the story's branch/);
    expect(await w.callsOf("api")).toEqual([]);
  });
});
