/**
 * STORY-12 review fixes, in local mode: a merge never loses uncommitted work, merges only the commit the checks passed
 * (after a restart too), takes the card's uncommitted edits, publishes only onto a feature branch that is where it was
 * read, and cleans up the story's branch on a remote. Real merge, settle, message, stop, scanner and card lane on a
 * real repository; the chat manager, the clock and, where a test says so, git's answers are faked.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMerged, MERGE_MESSAGES, parseCard, stoppedStory } from "@featra/work-format";
import { runGit } from "../src/git-run.ts";
import { createChatApi } from "../src/api-chat.ts";
import { REMOVE_NOTES } from "../src/merge-git.ts";
import { createStoryAcceptance } from "../src/story-acceptance.ts";
import { createStoryMessage } from "../src/story-message.ts";
import { createStoryStop } from "../src/story-stop.ts";
import { cardPath } from "./card-repo.ts";
import { FEATURE_BRANCH, LEAD, mergeWorld, SESSION, STORY_BRANCH } from "./story-merge-world.ts";

const m = mergeWorld();
const { w } = m;
const local = () => m.start({ remote: false });
const merge = () => m.merges.merge(w.repo.main, "STORY-1");
const onFeature = () => parseCard(w.repo.show(w.repo.main, FEATURE_BRANCH, "STORY-1"));

describe("a turn that runs mid-merge (review fix)", { timeout: 60_000 }, () => {
  it("can't start: the Dev Lead's message and Resume are refused while the story merges", async () => {
    await local();
    await m.verified();
    const messages = createStoryMessage({ scan: w.watches.scan, chats: m.chats, busy: m.merges.busy });
    const stops = createStoryStop({
      scan: w.watches.scan,
      now: w.clock.now,
      chats: { ...m.chats, stop: async () => {}, resume: async () => {}, dropQueued: () => false },
      busy: m.merges.busy,
    });
    const refusals: string[] = [];
    const said = (err: unknown) => void refusals.push(err instanceof Error ? err.message : String(err));
    m.onRetire = async () => {
      await messages.send(w.repo.main, { story: "STORY-1", text: "One more thing." }, LEAD).catch(said);
      await w.repo.write(w.tree, stoppedStory(await w.read(), "user", w.clock.now().toISOString()));
      await stops.resume(w.repo.main, "STORY-1").catch(said);
    };
    await expect(merge()).resolves.toEqual({ remains: [] });
    expect(refusals).toEqual([MERGE_MESSAGES.busy("STORY-1"), MERGE_MESSAGES.busy("STORY-1")]);
    expect(m.sent).toEqual([]);
  });

  it("can't start: the user's message in the story's chat and Send back are refused too", async () => {
    await local();
    await m.verified("Acceptance");
    const chat = createChatApi({
      chats: { ...m.chats, info: () => ({ storyId: "STORY-1" }), dirOf: () => w.repo.main } as never,
      roles: {} as never,
      allowed: {} as never,
      agents: {} as never,
      allow: (dir: string) => dir,
      project: () => w.repo.main,
      busy: m.merges.busy,
    });
    const acceptance = createStoryAcceptance({
      scan: w.watches.scan,
      now: w.clock.now,
      chats: m.chats,
      busy: m.merges.busy,
    });
    const refusals: string[] = [];
    const said = (err: unknown) => void refusals.push(err instanceof Error ? err.message : String(err));
    m.onRetire = async () => {
      await chat("chat.send", { id: SESSION, text: "One more thing." }, 1, {} as never).catch(said);
      await acceptance.sendBack(w.repo.main, "STORY-1", "Not yet.", false).catch(said);
    };
    await expect(merge()).resolves.toEqual({ remains: [] });
    expect(refusals).toEqual([MERGE_MESSAGES.busy("STORY-1"), MERGE_MESSAGES.busy("STORY-1")]);
    expect(m.sent).toEqual([]);
  });

  it("left uncommitted work: the worktree and its branch stay, files intact, and the user is told", async () => {
    await local();
    await m.verified();
    m.onRetire = () => writeFile(join(w.tree, "late.txt"), "written as the session ended\n");
    const { remains } = await merge();
    expect(remains).toHaveLength(2);
    expect(remains[0]).toMatch(/^The worktree .+ has uncommitted changes, so it's still there\.$/);
    expect(remains[1]).toBe(REMOVE_NOTES.branch(STORY_BRANCH));
    expect(m.treeExists()).toBe(true);
    expect(await readFile(join(w.tree, "late.txt"), "utf8")).toBe("written as the session ended\n");
    expect(m.hasBranch(STORY_BRANCH)).toBe(true);
    expect(isMerged(onFeature())).toBe(true);
  });
});

describe("after a restart (review fix)", { timeout: 60_000 }, () => {
  it("refuses a commit made since the checks passed: Featra never checked it", async () => {
    await local();
    await m.verified();
    w.repo.commit(w.tree, "after the checks");
    const feature = m.tip(FEATURE_BRANCH);
    await expect(merge()).rejects.toThrow(MERGE_MESSAGES.stale("STORY-1"));
    expect(m.tip(FEATURE_BRANCH)).toBe(feature);
  });

  it("merges the commit the card says the checks passed, a Done story too", async () => {
    await local();
    await m.verified("Done");
    await expect(merge()).resolves.toEqual({ remains: [] });
    expect(onFeature().status).toBe("Done");
    expect(isMerged(onFeature())).toBe(true);
  });
});

describe("the merge commit (review fixes)", { timeout: 60_000 }, () => {
  it("has the card's uncommitted edits", async () => {
    await local();
    await m.verified();
    await w.repo.write(w.tree, { ...(await w.read()), notes: "Edited, not committed." });
    await w.settle();
    await merge();
    const card = parseCard(w.repo.git(w.repo.main, "show", `${FEATURE_BRANCH}:${cardPath("STORY-1")}`));
    expect(card.notes).toContain("Edited, not committed.");
    expect(isMerged(card)).toBe(true);
  });

  it("fast-forwards a checkout that has the feature branch, so its files follow", async () => {
    await local();
    await m.verified();
    w.repo.git(w.repo.main, "checkout", "-q", FEATURE_BRANCH);
    await expect(merge()).resolves.toEqual({ remains: [] });
    expect(w.repo.git(w.repo.main, "rev-parse", "HEAD").trim()).toBe(m.tip(FEATURE_BRANCH));
    expect(await readFile(join(w.repo.main, "work.txt"), "utf8")).toBe("story\n");
    expect(w.repo.git(w.repo.main, "status", "--porcelain").trim()).toBe("");
  });

  it("isn't published onto a checkout with local changes in the way: nothing changes", async () => {
    await local();
    await m.verified();
    w.repo.git(w.repo.main, "checkout", "-q", FEATURE_BRANCH);
    await writeFile(join(w.repo.main, "work.txt"), "the user's\n");
    const feature = m.tip(FEATURE_BRANCH);
    await expect(merge()).rejects.toThrow(MERGE_MESSAGES.targetBusy(FEATURE_BRANCH));
    expect(m.tip(FEATURE_BRANCH)).toBe(feature);
    expect(await readFile(join(w.repo.main, "work.txt"), "utf8")).toBe("the user's\n");
    expect(m.treeExists()).toBe(true);
    expect(isMerged(await w.read())).toBe(false);
  });

  it("isn't published onto a feature branch that moved since it was read: nothing changes", async () => {
    await local();
    await m.verified();
    const elsewhere = w.repo.git(w.repo.main, "rev-parse", "HEAD").trim();
    m.gitRun = async (command, root, args, options) => {
      if (args[0] === "update-ref") w.repo.git(w.repo.main, "update-ref", `refs/heads/${FEATURE_BRANCH}`, elsewhere);
      return runGit(command, root, args, options);
    };
    await expect(merge()).rejects.toThrow(MERGE_MESSAGES.targetBusy(FEATURE_BRANCH));
    expect(m.tip(FEATURE_BRANCH)).toBe(elsewhere);
    expect(m.treeExists()).toBe(true);
    expect(isMerged(await w.read())).toBe(false);
  });

  it("needs git 2.38 or later, and says so", async () => {
    await local();
    await m.verified();
    m.gitRun = async (command, root, args, options) =>
      args[0] === "merge-tree"
        ? { code: 129, stdout: "", stderr: "usage: git merge-tree <base-tree> <branch1> <branch2>\n" }
        : runGit(command, root, args, options);
    await expect(merge()).rejects.toThrow(MERGE_MESSAGES.oldGit);
    expect(m.treeExists()).toBe(true);
  });
});

describe("what goes after a local merge (review fixes)", { timeout: 60_000 }, () => {
  it("deletes the story's branch on a remote that has it", async () => {
    await m.start({ remote: true, noGh: true });
    await m.verified();
    w.repo.git(w.tree, "push", "-q", "origin", STORY_BRANCH);
    expect(w.remoteBranches()).toContain(STORY_BRANCH);
    await expect(merge()).resolves.toEqual({ remains: [] });
    expect(w.remoteBranches()).not.toContain(STORY_BRANCH);
  });

  it("keeps a remote branch with commits the feature doesn't have, and says so", async () => {
    await m.start({ remote: true, noGh: true });
    await m.verified();
    const extra = w.repo.git(w.tree, "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "pushed elsewhere").trim();
    w.repo.git(w.tree, "push", "-q", "origin", `${extra}:refs/heads/${STORY_BRANCH}`);
    await expect(merge()).resolves.toEqual({ remains: [REMOVE_NOTES.unmerged(STORY_BRANCH)] });
    expect(w.repo.git(w.remote, "rev-parse", `refs/heads/${STORY_BRANCH}`).trim()).toBe(extra);
  });

  it("says the remote branch is still there when its remote can't be reached", async () => {
    await local();
    await m.verified();
    w.repo.git(w.repo.main, "remote", "add", "gone", join(w.repo.root, "no-such-remote.git"));
    w.repo.git(w.repo.main, "update-ref", `refs/remotes/gone/${STORY_BRANCH}`, m.tip(STORY_BRANCH));
    await expect(merge()).resolves.toEqual({ remains: [REMOVE_NOTES.remote(STORY_BRANCH)] });
  });

  it("removes a worktree that Windows still holds for a moment", async () => {
    await local();
    await m.verified();
    let held = true;
    m.gitRun = async (command, root, args, options) => {
      if (args[0] !== "worktree" || args[1] !== "remove" || !held) return runGit(command, root, args, options);
      held = false;
      return { code: 255, stdout: "", stderr: "error: failed to delete 'story-1': Device or resource busy\n" };
    };
    await expect(merge()).resolves.toEqual({ remains: [] });
    expect(held).toBe(false);
    expect(m.treeExists()).toBe(false);
  });
});
