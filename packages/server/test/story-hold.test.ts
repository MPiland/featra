/**
 * STORY-61: holding a story back from auto-merge. The real Hold and auto-merge on the merge world (a real repository
 * with FEAT-1's branch and STORY-1's worktree, the real scanner, watches, card lane, merge and settle); only the platform
 * is faked: the chat manager, which records the notices, and the clock. The setting is read from the project's config
 * and the app's settings file on disk, as the server reads it.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOLD_MESSAGES,
  isHeld,
  isMerged,
  MERGE_MESSAGES,
  notMergedOf,
  parseCard,
  withCheckEvidence,
} from "@featra/work-format";
import { createApi, type Connection } from "../src/api.ts";
import { createAutoMerge, type AutoMerge } from "../src/auto-merge.ts";
import { readAppAutoMerge, readAutoMerge } from "../src/mcp-enabled.ts";
import { recordNotMerged } from "../src/not-merged-record.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createStoryHold } from "../src/story-hold.ts";
import { createScanner } from "../src/work-scan.ts";
import { FEATURE_BRANCH, mergeWorld, STORY_BRANCH } from "./story-merge-world.ts";

const m = mergeWorld();
const { w } = m;
/** The real Hold, writing through the merge's card lane, as the server shares one. */
const holds = () => createStoryHold({ scan: w.watches.scan, now: w.clock.now, lane: m.lane });

const autos: AutoMerge[] = [];
/** Each story auto-merge recorded on its card as not merged (STORY-60), through the real record. */
const recorded: string[] = [];
/** Auto-merge as the server runs it, merging through `merge` (the real one by default). */
function autoMerge(merge = m.merges.merge, enabled = readAutoMerge(undefined)): AutoMerge {
  const auto = createAutoMerge({
    observe: w.watches.observe,
    allowed: w.allowed,
    enabled,
    merge,
    chats: { ...m.chats, notify: (chat, notice) => void m.notices.push({ chat, notice }) },
    record: (dir, id, tried, reason) => {
      recorded.push(id);
      return recordNotMerged({ scan: w.watches.scan, lane: m.lane, now: w.clock.now }, dir, id, tried, reason);
    },
    log: (line) => m.logs.push(line),
  });
  autos.push(auto);
  return auto;
}
const stopAll = () => {
  for (const auto of autos.splice(0)) auto.close();
  recorded.splice(0);
};
const settled = async (auto: AutoMerge) => {
  await w.settle();
  await auto.idle();
};
const inTree = async () => parseCard(await w.repo.read(w.tree, "STORY-1"));
const onFeature = () => parseCard(w.repo.show(w.repo.main, FEATURE_BRANCH, "STORY-1"));
/** The evidence of a passing run on the story branch's tip that proves every criterion. */
async function proveTip() {
  const card = await inTree();
  const config = (await w.watches.scan(w.repo.main))!.collected.config;
  const outcome = {
    passed: true,
    acs: card.acs.map((_, i) => ({ ac: i + 1, passed: true })),
    head: m.tip(STORY_BRANCH),
  };
  await w.repo.write(w.tree, withCheckEvidence(card, config, outcome, "system", w.clock.now().toISOString()));
  await w.settle();
}
const row = async (dir = w.repo.main) =>
  (await w.watches.scan(dir))!.list.epics
    .flatMap((e) => e.features.flatMap((f) => f.stories))
    .find((s) => s.id === "STORY-1");

describe("STORY-61 AC1: Hold is a toggle on a story, each turn recorded in its history", { timeout: 60_000 }, () => {
  it("writes held by the user in the story's worktree copy, and lets it go the same way", async () => {
    await m.start({ remote: false });
    await m.verified();
    const hold = holds();
    await expect(hold.hold(w.repo.main, "STORY-1", true)).resolves.toBeNull();
    const card = await inTree();
    expect(isHeld(card)).toBe(true);
    expect(card.history.at(-1)).toMatchObject({ field: "held", from: null, to: "held", by: "user" });
    expect((await row())?.held).toBe(true);

    await hold.hold(w.repo.main, "STORY-1", false);
    expect((await inTree()).history.at(-1)).toMatchObject({ field: "held", from: "held", to: null, by: "user" });
    expect((await row())?.held).toBe(false);
    // Again with nothing to change: no second event.
    const before = (await inTree()).history.length;
    await hold.hold(w.repo.main, "STORY-1", false);
    expect((await inTree()).history).toHaveLength(before);
  });

  it("is refused while auto-merge is off for the project, and the row shows no toggle", async () => {
    await m.start({ remote: false, yaml: "autoMerge: false\n" });
    await m.verified();
    await expect(holds().hold(w.repo.main, "STORY-1", true)).rejects.toThrow(HOLD_MESSAGES.off);
    expect((await row())?.held).toBeUndefined();
  });

  it("goes through the API's story.hold", async () => {
    await m.start({ remote: false });
    await m.verified();
    const api = createApi({ allowed: w.allowed, holds: holds() } as unknown as Parameters<typeof createApi>[0]);
    const connection = {} as Connection;
    await expect(api("story.hold", { dir: w.repo.main, id: "STORY-1", held: true }, 1, connection)).resolves.toBeNull();
    expect(isHeld(await inTree())).toBe(true);
    await expect(api("story.hold", { dir: w.repo.main, id: "STORY-1" }, 2, connection)).rejects.toThrow(
      "Expected { dir, id, held }.",
    );
  });
});

describe(
  "STORY-61 AC1: the toggle shows only while the auto-merge setting in effect is on",
  { timeout: 60_000 },
  () => {
    it("leaves Hold out of the row when the app default is off and the project doesn't set it", async () => {
      await m.start({ remote: false });
      await m.verified();
      const data = await mkdtemp(join(w.repo.root, "data-"));
      await writeFile(join(data, "settings.json"), JSON.stringify({ work: { autoMerge: false } }));
      const scanner = createScanner(createRepoGit(), { appAutoMerge: readAppAutoMerge(data) });
      const rows = async () =>
        (await scanner.scan(w.repo.main))!.list.epics.flatMap((e) => e.features.flatMap((f) => f.stories));
      try {
        expect((await rows()).find((s) => s.id === "STORY-1")?.held).toBeUndefined();
        await writeFile(join(data, "settings.json"), JSON.stringify({ work: { autoMerge: true } }));
        expect((await rows()).find((s) => s.id === "STORY-1")?.held).toBe(false);
      } finally {
        await scanner.close();
      }
    });
  },
);

describe("STORY-61 AC2: a held story never merges on its own, and Merge still works on it", { timeout: 60_000 }, () => {
  it("leaves a held, Verified and Proven story unmerged, which Merge then merges", async () => {
    await m.start({ remote: false });
    const auto = autoMerge();
    await m.verified();
    await holds().hold(w.repo.main, "STORY-1", true);
    await proveTip();
    await settled(auto);
    expect(m.treeExists()).toBe(true);
    expect(onFeature().history.some((e) => e.field === "merged")).toBe(false);
    expect(m.logs).toEqual([]);
    stopAll();
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [] });
    expect(isMerged(onFeature())).toBe(true);
  });

  it("doesn't merge a story held while auto-merge was about to look at it", async () => {
    await m.start({ remote: false });
    await m.verified();
    // Proven first with auto-merge not running, held, then auto-merge starts: it never tries.
    await proveTip();
    await holds().hold(w.repo.main, "STORY-1", true);
    const called: string[] = [];
    const auto = autoMerge(async (dir, id) => {
      called.push(id);
      return m.merges.merge(dir, id);
    });
    await settled(auto);
    expect(called).toEqual([]);
    expect(m.treeExists()).toBe(true);
    stopAll();
  });

  it("doesn't merge a story held while its try waits for its turn", async () => {
    await m.start({ remote: false });
    await m.verified();
    // The try's own look at the setting, in its turn, waits at a gate; the story is held meanwhile.
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const read = readAutoMerge(undefined);
    let looks = 0;
    const called: string[] = [];
    const auto = autoMerge(
      async (dir, id) => {
        called.push(id);
        return m.merges.merge(dir, id);
      },
      async (dir) => {
        looks += 1;
        if (looks === 2) await gate;
        return read(dir);
      },
    );
    await proveTip();
    await expect.poll(() => looks).toBe(2);
    await holds().hold(w.repo.main, "STORY-1", true);
    await w.settle();
    open();
    await settled(auto);
    expect(called).toEqual([]);
    expect(m.treeExists()).toBe(true);
    stopAll();
  });

  // Review regression: a try already inside merge() waited on the card lane behind the Hold, then merged the held story.
  it("doesn't merge a story held while its merge waits on the card lane", async () => {
    await m.start({ remote: false });
    await m.verified();
    // Every job that enters the lane is counted, so the test knows the Hold and then the merge are waiting in it.
    const enter = m.lane.exclusive;
    let jobs = 0;
    m.lane.exclusive = (job) => {
      jobs += 1;
      return enter(job);
    };
    let free!: () => void;
    const blocker = m.lane.exclusive(() => new Promise<void>((resolve) => (free = resolve)));
    let go!: () => void;
    const going = new Promise<void>((resolve) => (go = resolve));
    const called: string[] = [];
    const auto = autoMerge(async (dir, id, options) => {
      called.push(id);
      await going;
      return m.merges.merge(dir, id, options);
    });
    await proveTip();
    await expect.poll(() => called).toEqual(["STORY-1"]);
    const held = holds().hold(w.repo.main, "STORY-1", true);
    await expect.poll(() => jobs).toBe(2);
    go();
    await expect.poll(() => jobs).toBe(3);
    free();
    await blocker;
    await held;
    await settled(auto);
    expect(m.treeExists()).toBe(true);
    expect(onFeature().history.some((e) => e.field === "merged")).toBe(false);
    const card = await inTree();
    expect(isHeld(card)).toBe(true);
    // A race, not the story's failure: nothing is recorded on the card and nobody is told.
    expect(card.history.at(-1)).toMatchObject({ field: "held", to: "held", by: "user" });
    expect(m.notices).toEqual([]);
    expect(m.logs).toEqual([`STORY-1 didn't merge on its own: ${MERGE_MESSAGES.held("STORY-1")}`]);
    // STORY-60's scheme: a HeldRefusal isn't the story's own refusal, so nothing is recorded as not merged.
    expect(recorded).toEqual([]);
    expect(notMergedOf(card)).toBeNull();
    expect(card.history.some((e) => e.field === "not-merged")).toBe(false);
    stopAll();
  });
});

describe(
  "STORY-61 AC3: turning Hold off lets a Verified and Proven story merge on its own",
  { timeout: 60_000 },
  () => {
    it("merges the held story once it is let go, by system", async () => {
      await m.start({ remote: false });
      const auto = autoMerge();
      await m.verified();
      const hold = holds();
      await hold.hold(w.repo.main, "STORY-1", true);
      await proveTip();
      await settled(auto);
      expect(m.treeExists()).toBe(true);

      await hold.hold(w.repo.main, "STORY-1", false);
      await settled(auto);
      const card = onFeature();
      expect(isMerged(card)).toBe(true);
      expect(card.history.at(-1)).toMatchObject({ field: "merged", by: "system" });
      expect(card.history.filter((e) => e.field === "held").map((e) => e.to)).toEqual(["held", null]);
      expect(m.treeExists()).toBe(false);
      stopAll();
    });

    it("merges a story let go after a try that failed at the same commits", async () => {
      await m.start({ remote: false });
      await m.verified();
      let calls = 0;
      const auto = autoMerge(async (dir, id, options) => {
        calls += 1;
        if (calls === 1) throw new Error("The merge failed.");
        return m.merges.merge(dir, id, options);
      });
      await proveTip();
      await settled(auto);
      expect(calls).toBe(1);
      expect(m.treeExists()).toBe(true);
      // Tried once at these commits: nothing tries it again on its own.
      await settled(auto);
      expect(calls).toBe(1);

      const hold = holds();
      await hold.hold(w.repo.main, "STORY-1", true);
      await settled(auto);
      await hold.hold(w.repo.main, "STORY-1", false);
      await settled(auto);
      expect(calls).toBe(2);
      expect(isMerged(onFeature())).toBe(true);
      expect(m.treeExists()).toBe(false);
      stopAll();
    });
  },
);
