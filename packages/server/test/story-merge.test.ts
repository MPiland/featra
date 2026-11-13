/**
 * STORY-12: Merge in local mode (no GitHub remote). The real merge, settle, scanner, card lane and work-format rules on
 * a real repository; only the chat manager and the clock are faked. A merge commit into the feature branch, a conflict
 * that merges nothing, and what goes after a merge.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evidenceState, isMerged, MERGE_MESSAGES, parseCard } from "@featra/work-format";
import { cardPath } from "./card-repo.ts";
import { FEATURE_BRANCH, mergeWorld, SESSION, STORY_BRANCH } from "./story-merge-world.ts";

const m = mergeWorld();
const { w } = m;
const local = () => m.start({ remote: false });
/** STORY-1 as the feature branch's commit has it. */
const onFeature = () => parseCard(w.repo.show(w.repo.main, FEATURE_BRANCH, "STORY-1"));

describe("a local merge (AC2)", { timeout: 60_000 }, () => {
  it("makes a merge commit of the story's branch into its feature, with the card merged by system", async () => {
    await local();
    await m.verified();
    const feature = m.tip(FEATURE_BRANCH);
    const story = m.tip(STORY_BRANCH);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [] });
    const merge = m.tip(FEATURE_BRANCH);
    expect(m.parents(w.repo.main, merge)).toEqual([feature, story]);
    expect(w.repo.git(w.repo.main, "log", "-1", "--format=%s", merge).trim()).toBe("Merge STORY-1: Open a PR");
    expect(w.repo.git(w.repo.main, "show", `${merge}:work.txt`).trim()).toBe("story");
    expect(w.repo.git(w.repo.main, "show", `${merge}:feature.txt`).trim()).toBe("feature");
    const card = onFeature();
    expect(isMerged(card)).toBe(true);
    expect(card.history.at(-1)).toMatchObject({
      field: "merged",
      from: STORY_BRANCH,
      to: FEATURE_BRANCH,
      by: "system",
    });
  });

  it("leaves the status as it was: Verified and in review, or Done", async () => {
    await local();
    await m.verified("Acceptance");
    await m.merges.merge(w.repo.main, "STORY-1");
    const card = onFeature();
    expect(card.status).toBe("Acceptance");
    expect(evidenceState(card).verified).toBe(true);
  });

  it("merges a Verified story that isn't accepted yet: Merge needs Verified, not Accept (AC1)", async () => {
    await local();
    await m.verified("In Review");
    expect(evidenceState(await w.read()).accepted).toBe(false);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [] });
  });
});

describe("after the merge (AC5)", { timeout: 60_000 }, () => {
  it("removes the worktree and the story's branch, retires its session, and the feature branch owns the card", async () => {
    await local();
    await m.verified();
    await m.merges.merge(w.repo.main, "STORY-1");
    expect(m.treeExists()).toBe(false);
    expect(m.hasBranch(STORY_BRANCH)).toBe(false);
    expect(m.retired).toEqual([SESSION]);
    const scan = await w.watches.scan(w.repo.main);
    const owned = scan?.resolution.cards.find((c) => c.card.id === "STORY-1");
    expect(owned?.owner).toMatchObject({ kind: "feature", branch: FEATURE_BRANCH });
    expect(isMerged(owned!.card)).toBe(true);
  });

  it("refuses a second merge: the story is merged", async () => {
    await local();
    await m.verified();
    await m.merges.merge(w.repo.main, "STORY-1");
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(MERGE_MESSAGES.merged("STORY-1"));
  });
});

describe("a conflict (AC4)", { timeout: 60_000 }, () => {
  it("merges nothing, sends the session the files, then puts the story back in In Progress by system", async () => {
    await local();
    await m.onFeature("work.txt", "feature's\n");
    await m.verified();
    const feature = m.tip(FEATURE_BRANCH);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(
      MERGE_MESSAGES.conflict("STORY-1", ["work.txt"], "In Progress"),
    );
    expect(m.tip(FEATURE_BRANCH)).toBe(feature);
    expect(m.treeExists()).toBe(true);
    expect(m.opened).toEqual([SESSION]);
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0]?.chat).toBe(SESSION);
    expect(m.sent[0]?.text).toContain("- work.txt");
    const card = await w.read();
    expect(card.status).toBe("In Progress");
    expect(card.history.at(-1)).toMatchObject({ field: "status", to: "In Progress", by: "system" });
    expect(isMerged(card)).toBe(false);
    expect(m.retired).toEqual([]);
  });

  it("still records the conflict when the session can't be told, and says so in the log", async () => {
    await local();
    await m.onFeature("work.txt", "feature's\n");
    await m.verified();
    m.refuse = new Error("The chat is gone.");
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(/Nothing was merged/);
    expect((await w.read()).status).toBe("In Progress");
    expect(m.logs.join("\n")).toContain("The chat is gone.");
  });
});

describe("refusals (design rules)", { timeout: 60_000 }, () => {
  it("never loses uncommitted work: a dirty worktree is refused, naming the files, and nothing changes", async () => {
    await local();
    await m.verified();
    await writeFile(join(w.tree, "draft.txt"), "unsaved\n");
    const feature = m.tip(FEATURE_BRANCH);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(
      MERGE_MESSAGES.dirty("STORY-1", ["draft.txt"]),
    );
    expect(m.tip(FEATURE_BRANCH)).toBe(feature);
    expect(m.treeExists()).toBe(true);
  });

  it("needs Verified for the branch's current head: checks that settled on another commit, or still run, refuse", async () => {
    await local();
    await m.verified();
    m.checked = "0".repeat(40);
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(MERGE_MESSAGES.stale("STORY-1"));
    m.checked = null;
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(MERGE_MESSAGES.stale("STORY-1"));
    expect(m.hasBranch(STORY_BRANCH)).toBe(true);
  });

  it("refuses while the story's session is running a turn", async () => {
    await local();
    await m.verified();
    m.running = true;
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(MERGE_MESSAGES.working("STORY-1"));
  });

  it("refuses a story that isn't Verified, or isn't in review yet", async () => {
    await local();
    await w.repo.write(w.tree, { ...(await w.read()), status: "In Review" });
    await w.settle();
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(MERGE_MESSAGES.notVerified("STORY-1"));
    await m.verified("In Progress");
    await expect(m.merges.merge(w.repo.main, "STORY-1")).rejects.toThrow(
      MERGE_MESSAGES.notReady("STORY-1", "In Progress"),
    );
  });

  it("keeps the card file out of the dirty check: the card's own uncommitted changes are merged", async () => {
    await local();
    await m.verified();
    expect(w.repo.git(w.tree, "status", "--porcelain").trim()).toContain(cardPath("STORY-1"));
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [] });
  });
});
