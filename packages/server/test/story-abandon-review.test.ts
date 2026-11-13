/**
 * STORY-58 review fixes: what Abandon warns of, a story its feature branch owns, and an abandon tried again. The real
 * abandon, scanner and card lane on a real repository with a bare remote; GitHub is the fake `gh`, and the chat
 * manager, the clock and (where a step must fail) git's runner are faked.
 */
import { describe, expect, it } from "vitest";
import { atRisk, CANCELLED } from "@featra/work-format";
import { REMOVE_NOTES } from "../src/merge-git.ts";
import { runGit } from "../src/git-run.ts";
import { abandonWorld, FEATURE_BRANCH, STORY_BRANCH } from "./story-abandon-world.ts";

const a = abandonWorld();
const { m } = a;
const { w } = m;

describe("the warning's loss set (review fix)", { timeout: 60_000 }, () => {
  it("lists commits pushed only to the story's own remote branch, which goes with it", async () => {
    await a.start();
    await a.commitInTree("pushed.txt", "Pushed work");
    w.repo.git(w.tree, "push", "-q", "origin", STORY_BRANCH);
    const warning = await a.check();
    expect(warning).toMatchObject({ pr: null, branch: STORY_BRANCH, remotes: ["origin"] });
    expect(warning.unpushed).toHaveLength(1);
    expect(warning.unpushed[0]).toMatch(/^[0-9a-f]{7,} Pushed work$/);
    expect(atRisk(warning)).toBe(true);
  });

  it("leaves out commits another remote branch has", async () => {
    await a.start();
    await a.commitInTree("shared.txt", "Shared work");
    w.repo.git(w.tree, "push", "-q", "origin", `${STORY_BRANCH}:refs/heads/elsewhere`);
    w.repo.git(w.tree, "fetch", "-q", "origin");
    expect((await a.check()).unpushed).toEqual([]);
  });
});

/** STORY-2, New under FEAT-1, committed on the feature branch alone, which no folder has checked out. */
async function story2OnFeature() {
  const card = { ...(await w.read()), id: "STORY-2", status: "New", branch: null, pr: null };
  await w.repo.commitOn(FEATURE_BRANCH, (tree) => w.repo.write(tree, card), "STORY-2");
  await a.scan();
}

describe("a story its feature branch owns (review fix)", { timeout: 60_000 }, () => {
  it("is kept as Cancelled on that branch", async () => {
    await a.start({ remote: false });
    await story2OnFeature();
    const warning = await a.check("STORY-2");
    expect(warning).toMatchObject({ files: [], unpushed: [], pr: null, branch: null, remotes: [] });
    await expect(a.abandon(true, warning.token, "STORY-2")).resolves.toEqual({ remains: [] });
    expect(a.cardOn(FEATURE_BRANCH, "STORY-2")?.status).toBe(CANCELLED);
    expect(w.repo.git(w.repo.main, "log", "-1", "--format=%s", FEATURE_BRANCH).trim()).toBe(
      "STORY-2: abandoned, kept as Cancelled",
    );
    expect((await a.scan())?.resolution.cards.find((c) => c.card.id === "STORY-2")?.card.status).toBe(CANCELLED);
  });

  it("is discarded from that branch, and stays gone", async () => {
    await a.start({ remote: false });
    await story2OnFeature();
    const { token } = await a.check("STORY-2");
    await a.abandon(false, token, "STORY-2");
    expect(a.cardOn(FEATURE_BRANCH, "STORY-2")).toBeNull();
    expect((await a.scan())?.resolution.cards.map((c) => c.card.id)).not.toContain("STORY-2");
  });
});

describe("an abandon tried again (review fix)", { timeout: 60_000 }, () => {
  it("makes no second commit on the feature branch when the card there is already as it should be", async () => {
    await a.start({ remote: false });
    let fail = true;
    m.gitRun = async (command, root, args, options) => {
      if (fail && args[0] === "worktree" && args[1] === "remove") {
        fail = false;
        return { code: 128, stdout: "", stderr: "fatal: cannot remove the worktree\n" };
      }
      return runGit(command, root, args, options);
    };
    const first = await a.abandon(true, (await a.check()).token);
    expect(first.remains).toEqual([REMOVE_NOTES.folder(w.tree), REMOVE_NOTES.branch(STORY_BRANCH)]);
    const tip = m.tip(FEATURE_BRANCH);

    await expect(a.abandon(true, (await a.check()).token)).resolves.toEqual({ remains: [] });
    expect(m.tip(FEATURE_BRANCH)).toBe(tip);
    expect(a.cardOn(FEATURE_BRANCH)?.status).toBe(CANCELLED);
    expect(a.treeExists()).toBe(false);
    expect(m.hasBranch(STORY_BRANCH)).toBe(false);
  });
});
