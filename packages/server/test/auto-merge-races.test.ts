/**
 * STORY-60 review: only a refusal that is the story's own at its commit is recorded and told to the Dev Lead. A race, a
 * passing failure or a bug leaves nothing on the card, and the story is looked at again. A conflict stands only while
 * the story's commit and the feature branch's tip both stay where they were. The real auto-merge on the merge world
 * (auto-merge-world.ts); only the platform is faked: the chat manager, GitHub (fake-gh.cjs) and the clock.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMerged, MERGE_MESSAGES, notMergedOf, type Card } from "@featra/work-format";
import type { MergeResult } from "../src/merge-settle.ts";
import { autoMergeWorld } from "./auto-merge-world.ts";
import { FEATURE_BRANCH, STORY_BRANCH } from "./story-merge-world.ts";

const { m, w, autoMerge, provenAt, proven, onFeature, settled, stopAll, twoProven } = autoMergeWorld();

const notMergedEvents = (card: Card) => card.history.filter((e) => e.field === "not-merged");
const GH_DOWN = "error connecting to api.github.com";

describe(
  "STORY-60 review 1: a refusal that isn't the story's own is neither recorded nor told",
  { timeout: 60_000 },
  () => {
    it("merges a story moved back to In Review on the same commit after a move while it was queued behind a sibling", async () => {
      await twoProven();
      let moved = false;
      // STORY-1 is moved to In Progress as its queued merge begins, before auto-merge sees the move.
      const movedWhileQueued = async (dir: string, id: string) => {
        if (id === "STORY-1" && !moved) {
          moved = true;
          await w.moveOn("In Progress");
        }
        return m.merges.merge(dir, id);
      };
      const auto = autoMerge(movedWhileQueued);
      await settled(auto);
      expect(moved).toBe(true);
      expect(isMerged(onFeature("STORY-2"))).toBe(true);
      expect(m.notices.filter((n) => n.notice.story === "STORY-1")).toEqual([]);
      expect(notMergedEvents(await w.read())).toEqual([]);

      await w.moveOn("In Review");
      await settled(auto);
      expect(isMerged(onFeature())).toBe(true);
      stopAll();
    });

    it("records and tells nothing when GitHub can't be read, and merges on the next look once it can", async () => {
      await m.start();
      await proven();
      await w.gh.change((s) => void (s.viewFails = GH_DOWN));
      const auto = autoMerge();
      await settled(auto);
      expect(m.notices).toEqual([]);
      expect(notMergedEvents(await w.read())).toEqual([]);
      expect(m.logs).toEqual([`STORY-1 didn't merge on its own: ${MERGE_MESSAGES.failed}.`]);
      expect(m.treeExists()).toBe(true);

      await w.gh.change((s) => void delete s.viewFails);
      auto.recheck();
      await settled(auto);
      expect(isMerged(onFeature())).toBe(true);
      expect(m.notices.map((n) => n.notice.outcome)).toEqual(["merged"]);
      stopAll();
    });
  },
);

describe("STORY-60 review 2 and 3: races with Merge by hand", { timeout: 60_000 }, () => {
  it("sends no notice when a Merge by hand finishes while the automatic one waits", async () => {
    await m.start({ remote: false });
    // The user's Merge runs to the end just before the queued automatic merge starts.
    const afterHand = async (dir: string, id: string) => {
      await m.merges.merge(dir, id);
      return m.merges.merge(dir, id);
    };
    const auto = autoMerge(afterHand);
    await proven();
    await settled(auto);
    expect(isMerged(onFeature())).toBe(true);
    expect(m.notices).toEqual([]);
    expect(notMergedEvents(onFeature())).toEqual([]);
    stopAll();
  });

  it("sends no notice and records nothing when a Merge by hand is running as the automatic one starts", async () => {
    await m.start({ remote: false });
    let hand: Promise<MergeResult> | undefined;
    // The user's Merge starts as the automatic merge does, once.
    const whileHand = (dir: string, id: string) => {
      hand ??= m.merges.merge(dir, id);
      return m.merges.merge(dir, id);
    };
    const auto = autoMerge(whileHand);
    await proven();
    await settled(auto);
    await hand;
    expect(isMerged(onFeature())).toBe(true);
    expect(m.notices).toEqual([]);
    expect(notMergedEvents(onFeature())).toEqual([]);
    stopAll();
  });
});

describe(
  "STORY-60 review: a conflict stands while the story's commit and the feature's tip stay",
  { timeout: 60_000 },
  () => {
    it("tries once more and merges when the feature branch's conflicting change is reverted", async () => {
      await m.start({ remote: false });
      await m.onFeature("work.txt", "feature's\n");
      const auto = autoMerge();
      await proven();
      await settled(auto);
      const head = m.tip(STORY_BRANCH);
      expect(notMergedOf(await w.read())).toMatchObject({ head, tip: m.tip(FEATURE_BRANCH) });

      // Back in review at the same commit, checked again: the conflict still stands, so it isn't tried.
      await w.moveOn("In Review");
      await provenAt(w.tree, "STORY-1", head);
      await settled(auto);
      expect(m.notices).toHaveLength(1);
      expect(isMerged(await w.read())).toBe(false);

      await w.repo.commitOn(FEATURE_BRANCH, (tree) => rm(join(tree, "work.txt")), "revert work.txt");
      await settled(auto);
      // It merged the same commit: the story's head is the merge commit's second parent.
      expect(m.parents(w.repo.main, FEATURE_BRANCH)[1]).toBe(head);
      expect(isMerged(onFeature())).toBe(true);
      stopAll();
    });
  },
);
