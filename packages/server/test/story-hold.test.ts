/**
 * STORY-61: holding a story back from auto-merge. The real Hold and auto-merge on the merge world (a real repository
 * with FEAT-1's branch and STORY-1's worktree, the real scanner, watches, card lane, merge and settle); only the platform
 * is faked: the chat manager, which records the notices, and the clock. The setting is read from the project's config
 * and the app's settings file on disk, as the server reads it.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOLD_MESSAGES, isHeld, isMerged, parseCard, withCheckEvidence } from "@featra/work-format";
import { createApi, type Connection } from "../src/api.ts";
import { createAutoMerge, type AutoMerge } from "../src/auto-merge.ts";
import { readAutoMerge } from "../src/mcp-enabled.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createStoryHold } from "../src/story-hold.ts";
import { createScanner } from "../src/work-scan.ts";
import { FEATURE_BRANCH, mergeWorld, STORY_BRANCH } from "./story-merge-world.ts";

const m = mergeWorld();
const { w } = m;
const holds = () => createStoryHold({ scan: w.watches.scan, now: w.clock.now });

const autos: AutoMerge[] = [];
/** Auto-merge as the server runs it, merging through `merge` (the real one by default). */
function autoMerge(merge = m.merges.merge, enabled = readAutoMerge(undefined)): AutoMerge {
  const auto = createAutoMerge({
    observe: w.watches.observe,
    allowed: w.allowed,
    enabled,
    merge,
    chats: { ...m.chats, notify: (chat, notice) => void m.notices.push({ chat, notice }) },
    log: (line) => m.logs.push(line),
  });
  autos.push(auto);
  return auto;
}
const stopAll = () => {
  for (const auto of autos.splice(0)) auto.close();
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
      const scanner = createScanner(createRepoGit(), { autoMerge: readAutoMerge(data) });
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
  },
);
