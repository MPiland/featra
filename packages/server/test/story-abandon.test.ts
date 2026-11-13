/**
 * STORY-58: Abandon a story. The real abandon, scanner, card lane, PR reads and work-format rules on a real repository
 * with a bare remote; GitHub is the fake `gh`, and the chat manager and the clock are faked.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ABANDON_MESSAGES, CANCELLED } from "@featra/work-format";
import { ABANDON_NOTES } from "../src/abandon-git.ts";
import { indexFile, openCardIndex } from "../src/card-index.ts";
import { SETTLE_NOTES } from "../src/merge-settle.ts";
import { abandonWorld, FEATURE_BRANCH, PR, SESSION, STORY_BRANCH } from "./story-abandon-world.ts";

const a = abandonWorld();
const { m } = a;
const { w } = m;

/** What an abandoned story leaves: no worktree, no local or remote branch, its session retired. */
function expectRemoved() {
  expect(a.treeExists()).toBe(false);
  expect(m.hasBranch(STORY_BRANCH)).toBe(false);
  expect(w.remoteBranches()).not.toContain(STORY_BRANCH);
  expect(m.retired).toEqual([SESSION]);
}

/** FEAT-1's row on the Work list, as the scan builds it. */
async function featureRow() {
  return (await a.scan())?.list.epics.flatMap((e) => e.features).find((f) => f.id === "FEAT-1");
}

describe("the warning (AC1)", { timeout: 60_000 }, () => {
  it("names uncommitted files, commits only on this branch, the PR it closes, the branch and the remote", async () => {
    await a.start();
    await m.verified();
    await a.commitInTree("late.txt", "Late work");
    await a.scratch("notes.txt");
    const warning = await a.check();
    expect(warning).toMatchObject({
      files: ["notes.txt"],
      pr: PR,
      branch: STORY_BRANCH,
      remotes: ["origin"],
    });
    // The PR's commit is on GitHub only on the story's own branch, which goes with it (review fix), so it is listed too.
    expect(warning.unpushed).toHaveLength(2);
    expect(warning.unpushed[0]).toMatch(/^[0-9a-f]{7,} Late work$/);
    expect(warning.unpushed[1]).toMatch(/^[0-9a-f]{7,} work$/);
  });

  it("warns of nothing but the worktree and branch when nothing would be lost", async () => {
    await a.start({ remote: false });
    const warning = await a.check();
    expect(warning).toMatchObject({ files: [], unpushed: [], pr: null, branch: STORY_BRANCH, remotes: [] });
  });

  it("refuses to go ahead once something new would be lost, and changes nothing", async () => {
    await a.start({ remote: false });
    const { token } = await a.check();
    await a.scratch("notes.txt");
    await expect(a.abandon(true, token)).rejects.toThrow(ABANDON_MESSAGES.changed("STORY-1"));
    expect(a.treeExists()).toBe(true);
    expect(m.hasBranch(STORY_BRANCH)).toBe(true);
    expect(m.retired).toEqual([]);
    expect(a.cardOn(FEATURE_BRANCH)?.status).toBe("Ready");
  });

  it("refuses a done story", async () => {
    await a.start({ remote: false });
    await w.moveOn("Done");
    await expect(a.check()).rejects.toThrow(ABANDON_MESSAGES.done("STORY-1"));
  });
});

describe("abandoning with GitHub usable (AC2, AC3)", { timeout: 60_000 }, () => {
  it("keeps the card as Cancelled on the feature branch, closes the PR, removes the worktree and branches", async () => {
    await a.start();
    await m.verified();
    expect((await featureRow())?.progress).toMatchObject({ total: 1 });
    const { token } = await a.check();
    // The card's commit leaves the feature branch ahead of GitHub's copy, as Merge says (review fix).
    await expect(a.abandon(true, token)).resolves.toEqual({ remains: [SETTLE_NOTES.ahead(FEATURE_BRANCH, 1)] });

    expect(await w.callsOf("pr close")).toEqual([["pr", "close", PR]]);
    expect((await w.gh.load()).prs[0]?.state).toBe("CLOSED");
    expectRemoved();
    const card = a.cardOn(FEATURE_BRANCH);
    expect(card?.status).toBe(CANCELLED);
    expect(card?.history.at(-1)).toMatchObject({ field: "status", to: CANCELLED, by: "user" });
    expect(w.repo.git(w.repo.main, "log", "-1", "--format=%s", FEATURE_BRANCH).trim()).toBe(
      "STORY-1: abandoned, kept as Cancelled",
    );
    // Logged, shown as a Cancelled row, and left out of the feature's counts.
    const row = await featureRow();
    expect(row?.stories.find((s) => s.id === "STORY-1")).toMatchObject({ stage: CANCELLED });
    expect(row?.progress).toMatchObject({ total: 0 });
  });

  it("stops a running turn before it retires the session", async () => {
    await a.start();
    await m.verified();
    const { token } = await a.check();
    m.running = true;
    await a.abandon(true, token);
    expect(a.order).toEqual([`stop:${SESSION}`, `retire:${SESSION}`]);
  });

  it("leaves the story as it was when the PR can't be closed", async () => {
    await a.start();
    await m.verified();
    await w.gh.change((s) => {
      s.closeFails = "GraphQL: Could not close the pull request.";
    });
    const { token } = await a.check();
    await expect(a.abandon(false, token)).rejects.toThrow("Could not close the pull request.");
    expect((await w.gh.load()).prs[0]?.state).toBe("OPEN");
    expect(a.treeExists()).toBe(true);
    expect(m.hasBranch(STORY_BRANCH)).toBe(true);
    expect(w.remoteBranches()).toContain(STORY_BRANCH);
    expect(a.cardOn(FEATURE_BRANCH)?.status).toBe("Ready");
    expect((await w.read()).status).toBe("In Review");
    expect(m.retired).toEqual([]);
  });

  it("leaves a remote branch with commits that aren't here, and says so", async () => {
    await a.start();
    await m.verified();
    await a.commitInTree("theirs.txt", "Pushed from elsewhere");
    w.repo.git(w.tree, "push", "-q", "origin", STORY_BRANCH);
    w.repo.git(w.tree, "reset", "-q", "--hard", "HEAD~1");
    const { token, remotes } = await a.check();
    expect(remotes).toEqual([]);
    await expect(a.abandon(true, token)).resolves.toEqual({
      remains: [SETTLE_NOTES.ahead(FEATURE_BRANCH, 1), ABANDON_NOTES.ahead(STORY_BRANCH)],
    });
    expect(a.treeExists()).toBe(false);
    expect(m.hasBranch(STORY_BRANCH)).toBe(false);
    expect(w.remoteBranches()).toContain(STORY_BRANCH);
  });
});

describe("discarding the card (AC2)", { timeout: 60_000 }, () => {
  it("deletes it on the feature branch and from the index; main's older copy doesn't bring it back", async () => {
    await a.start({ remote: false });
    await a.scratch("notes.txt");
    const { token } = await a.check();
    await expect(a.abandon(false, token)).resolves.toEqual({ remains: [] });
    expectRemoved();
    expect(a.cardOn(FEATURE_BRANCH)).toBeNull();
    expect(a.cardOn("main")?.status).toBe("Ready");
    const scan = await a.scan();
    expect(scan?.resolution.cards.map((c) => c.card.id)).not.toContain("STORY-1");
    expect(scan?.resolution.problems).toEqual([]);
    const index = openCardIndex(indexFile(join(w.repo.main, ".git")));
    try {
      expect(index.owners().map((o) => o.cardId)).not.toContain("STORY-1");
    } finally {
      index.close();
    }
  });
});

/** STORY-2, on main alone: no feature, no branch, no worktree. */
async function story2() {
  await w.repo.write(w.repo.main, { ...(await w.read()), id: "STORY-2", parent: null, branch: null, pr: null });
  w.repo.commit(w.repo.main, "STORY-2");
  await a.scan();
}

describe("a story with no worktree (AC2)", { timeout: 60_000 }, () => {
  it("is kept as Cancelled where its owner has it, with nothing else to remove", async () => {
    await a.start({ remote: false });
    await story2();
    const warning = await a.check("STORY-2");
    expect(warning).toMatchObject({ files: [], unpushed: [], pr: null, branch: null, remotes: [] });
    await expect(a.abandon(true, warning.token, "STORY-2")).resolves.toEqual({ remains: [] });
    expect((await a.scan())?.resolution.cards.find((c) => c.card.id === "STORY-2")?.card.status).toBe(CANCELLED);
    expect(a.treeExists()).toBe(true);
    expect(a.stopped).toEqual([]);
  });

  it("is discarded where its owner has it, and stays gone", async () => {
    await a.start({ remote: false });
    await story2();
    const { token } = await a.check("STORY-2");
    await a.abandon(false, token, "STORY-2");
    expect((await a.scan())?.resolution.cards.map((c) => c.card.id)).not.toContain("STORY-2");
  });
});

describe("one ending at a time (AC3)", { timeout: 60_000 }, () => {
  it("refuses the session's messages and a second Abandon while one runs", async () => {
    await a.start({ remote: false });
    const { token } = await a.check();
    const refusals: string[] = [];
    const said = (err: unknown) => void refusals.push(err instanceof Error ? err.message : String(err));
    m.onRetire = async () => {
      refusals.push(a.ending.busy(w.repo.main, "STORY-1") ?? "");
      await a.check().catch(said);
      await a.abandon(true, token).catch(said);
    };
    await expect(a.abandon(true, token)).resolves.toBeDefined();
    expect(refusals).toEqual([
      ABANDON_MESSAGES.busy("STORY-1"),
      ABANDON_MESSAGES.busy("STORY-1"),
      ABANDON_MESSAGES.abandoning("STORY-1"),
    ]);
  });
});
