/**
 * STORY-59: a Verified and Proven story merges into its feature on its own. The real auto-merge on the merge world (a
 * real repository with FEAT-1's branch and STORY-1's worktree, the real scanner, watches, card lane, merge and settle);
 * only the platform is faked: the chat manager, which records the notices, and the clock. The setting is read from the
 * project's config and the app's settings file on disk, as the server reads it.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { autoMergedSummary, isMerged, MERGE_MESSAGES, parseCard, withCheckEvidence } from "@featra/work-format";
import { createAutoMerge, type AutoMerge } from "../src/auto-merge.ts";
import { readAutoMerge } from "../src/mcp-enabled.ts";
import { FEATURE_BRANCH, LEAD, mergeWorld, STORY_BRANCH } from "./story-merge-world.ts";
import { storyCard } from "./story-prs-world.ts";

const m = mergeWorld();
const { w } = m;
const STORY_2_BRANCH = "featra/story-2-more";

/**
 * Auto-merge as the server runs it: the setting read from the project's config and the app's settings in `dataDir`
 * (none by default), and merges through `merge`, the real one by default.
 */
function autoMerge(merge = m.merges.merge, dataDir?: string, enabled = readAutoMerge(dataDir)): AutoMerge {
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
const autos: AutoMerge[] = [];

const config = async () => (await w.watches.scan(w.repo.main))!.collected.config;
/** The evidence of a passing run on `head` that proves every criterion, written in the story's worktree `tree`. */
async function provenAt(tree: string, id: string, head: string) {
  const card = parseCard(await w.repo.read(tree, id));
  const outcome = { passed: true, acs: card.acs.map((_, i) => ({ ac: i + 1, passed: true })), head };
  await w.repo.write(tree, withCheckEvidence(card, await config(), outcome, "system", w.clock.now().toISOString()));
  await w.settle();
}
/** STORY-1 with committed work, in `status`, Verified and Proven for its branch's tip. */
async function proven(status = "In Review") {
  await m.verified(status);
  await provenAt(w.tree, "STORY-1", m.tip(STORY_BRANCH));
}
const onFeature = (id = "STORY-1") => parseCard(w.repo.show(w.repo.main, FEATURE_BRANCH, id));
const settled = async (auto: AutoMerge) => {
  await w.settle();
  await auto.idle();
};
const stopAll = () => {
  for (const auto of autos.splice(0)) auto.close();
};
/** STORY-1 and STORY-2, planned too and worked on in its own worktree off the feature branch, both Proven. */
async function twoProven() {
  await w.repo.write(w.repo.main, storyCard("Ready", { id: "STORY-2", title: "More", branch: null }));
  w.repo.commit(w.repo.main, "plan STORY-2");
  await m.start({ remote: false });
  const tree2 = w.repo.worktree(STORY_2_BRANCH, "story-2", FEATURE_BRANCH);
  await writeFile(join(tree2, "more.txt"), "more\n");
  await w.repo.write(tree2, storyCard("In Review", { id: "STORY-2", title: "More", branch: STORY_2_BRANCH }));
  w.repo.commit(tree2, "more");
  await provenAt(tree2, "STORY-2", w.repo.git(tree2, "rev-parse", "HEAD"));
  await proven();
}

describe(
  "STORY-59 AC1: with auto-merge on, a Verified and Proven story merges as Merge does",
  { timeout: 60_000 },
  () => {
    it("merges into its feature branch with a merge commit, merged by system, without Accept", async () => {
      await m.start({ remote: false });
      const auto = autoMerge();
      await m.verified();
      const before = m.tip(FEATURE_BRANCH);
      await provenAt(w.tree, "STORY-1", m.tip(STORY_BRANCH));
      const story = m.tip(STORY_BRANCH);
      await settled(auto);

      const card = onFeature();
      expect(isMerged(card)).toBe(true);
      expect(card.history.at(-1)).toMatchObject({
        field: "merged",
        from: STORY_BRANCH,
        to: FEATURE_BRANCH,
        by: "system",
      });
      expect(card.status).toBe("In Review");
      expect(card.history.some((e) => e.field === "accepted")).toBe(false);
      expect(m.parents(w.repo.main, m.tip(FEATURE_BRANCH))).toEqual([before, story]);
      expect(m.treeExists()).toBe(false);
      expect(m.hasBranch(STORY_BRANCH)).toBe(false);
      stopAll();
    });
  },
);

describe(
  "STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't",
  { timeout: 60_000 },
  () => {
    it("leaves a Verified story that isn't Proven, which Merge still merges", async () => {
      await m.start({ remote: false });
      const auto = autoMerge();
      await m.verified();
      await settled(auto);
      expect(m.treeExists()).toBe(true);
      expect(onFeature().history.some((e) => e.field === "merged")).toBe(false);
      stopAll();
      await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [] });
    });

    it("leaves a Proven story Merge refuses: one not in review yet", async () => {
      await m.start({ remote: false });
      const auto = autoMerge();
      await proven("In Progress");
      await settled(auto);
      expect(m.treeExists()).toBe(true);
      expect(m.logs).toEqual([]);
      stopAll();
    });

    it("leaves a story proven at a commit before its latest, and merges it once proven at that one", async () => {
      await m.start({ remote: false });
      const auto = autoMerge();
      await m.verified();
      const checked = m.tip(STORY_BRANCH);
      // More work after the checks ran: Verified and Proven are for the commit before, so it isn't even tried.
      await writeFile(join(w.tree, "more.txt"), "more\n");
      w.repo.commit(w.tree, "more");
      await provenAt(w.tree, "STORY-1", checked);
      await settled(auto);
      expect(m.logs).toEqual([]);
      expect(m.treeExists()).toBe(true);
      await provenAt(w.tree, "STORY-1", m.tip(STORY_BRANCH));
      await settled(auto);
      expect(isMerged(onFeature())).toBe(true);
      stopAll();
    });

    it("tries a story head once: refused for work left uncommitted, it waits until its commits change", async () => {
      await m.start({ remote: false });
      const auto = autoMerge();
      await m.verified();
      // Work left uncommitted, which Merge refuses and the rule over the card can't see.
      await writeFile(join(w.tree, "more.txt"), "more\n");
      await provenAt(w.tree, "STORY-1", m.tip(STORY_BRANCH));
      await settled(auto);
      expect(m.logs).toEqual([`STORY-1 didn't merge on its own: ${MERGE_MESSAGES.dirty("STORY-1", ["more.txt"])}`]);

      // Rescans with nothing new for the story don't try again: its move, or the project's setting turned off and on.
      await w.moveOn("Acceptance");
      await settled(auto);
      const settings = join(w.repo.main, ".featra", "config.yaml");
      await writeFile(settings, "version: 1\nautoMerge: false\n");
      await settled(auto);
      await writeFile(settings, "version: 1\nautoMerge: true\n");
      await settled(auto);
      expect(m.logs).toHaveLength(1);
      expect(m.treeExists()).toBe(true);

      // The work is committed and the checks pass on the new commit: it merges.
      w.repo.commit(w.tree, "more");
      await provenAt(w.tree, "STORY-1", m.tip(STORY_BRANCH));
      await settled(auto);
      expect(isMerged(onFeature())).toBe(true);
      expect(m.logs).toHaveLength(1);
      stopAll();
    });
  },
);

describe(
  "STORY-59 AC3: checked on evidence changes and when the project opens, one at a time per feature",
  { timeout: 60_000 },
  () => {
    it("merges a story already Verified and Proven when the project opens", async () => {
      await m.start({ remote: false });
      await proven();
      expect(m.treeExists()).toBe(true);
      const auto = autoMerge();
      await settled(auto);
      expect(isMerged(onFeature())).toBe(true);
      stopAll();
    });

    it("merges a story as its evidence makes it Proven", async () => {
      await m.start({ remote: false });
      const auto = autoMerge();
      await m.verified();
      await settled(auto);
      expect(m.treeExists()).toBe(true);
      await provenAt(w.tree, "STORY-1", m.tip(STORY_BRANCH));
      await settled(auto);
      expect(isMerged(onFeature())).toBe(true);
      stopAll();
    });

    it("merges two stories of one feature one after the other, never at once", async () => {
      await twoProven();

      let running = 0;
      let most = 0;
      const order: string[] = [];
      const counted = async (dir: string, id: string) => {
        running++;
        most = Math.max(most, running);
        order.push(id);
        try {
          return await m.merges.merge(dir, id);
        } finally {
          running--;
        }
      };
      const auto = autoMerge(counted);
      await settled(auto);
      await settled(auto);
      expect(order.toSorted()).toEqual(["STORY-1", "STORY-2"]);
      expect(most).toBe(1);
      expect(isMerged(onFeature("STORY-1"))).toBe(true);
      expect(isMerged(onFeature("STORY-2"))).toBe(true);
      stopAll();
    });

    it("passes over a story whose session is working, and merges it once the session is idle", async () => {
      await m.start({ remote: false });
      const auto = autoMerge();
      m.running = true;
      await proven();
      await settled(auto);
      // Not tried: Merge would refuse it as working, and nothing would try it again.
      expect(m.logs).toEqual([]);
      expect(m.treeExists()).toBe(true);
      m.running = false;
      m.chatsChanged();
      await settled(auto);
      expect(isMerged(onFeature())).toBe(true);
      expect(m.logs).toEqual([]);
      stopAll();
    });

    it("merges each story once when its project is removed and added back while their merges wait", async () => {
      await twoProven();

      // One story's merge waits at a gate; the other waits behind it, in its feature's line.
      let open!: () => void;
      const gate = new Promise<void>((resolve) => (open = resolve));
      const called: string[] = [];
      const gated = async (dir: string, id: string) => {
        called.push(id);
        await gate;
        return m.merges.merge(dir, id);
      };
      const looks: Promise<boolean>[] = [];
      const read = readAutoMerge(undefined);
      const auto = autoMerge(gated, undefined, (dir) => {
        const on = read(dir);
        looks.push(on);
        return on;
      });
      await expect.poll(() => called.length).toBe(1);
      const before = looks.length;
      w.allowed.set([]);
      w.allowed.set([w.repo.main]);
      // The project added back has looked at its stories.
      await expect.poll(() => looks.length).toBeGreaterThan(before);
      await looks.at(-1);
      open();
      await settled(auto);
      await settled(auto);
      expect(called.toSorted()).toEqual(["STORY-1", "STORY-2"]);
      expect(m.logs.filter((l) => l.includes("didn't merge"))).toEqual([]);
      expect(isMerged(onFeature("STORY-1"))).toBe(true);
      expect(isMerged(onFeature("STORY-2"))).toBe(true);
      stopAll();
    });
  },
);

describe("STORY-59 AC4: with auto-merge off nothing merges on its own", { timeout: 60_000 }, () => {
  it("leaves a Verified and Proven story for Merge when the project turns it off, and merges it once it's on", async () => {
    await m.start({ remote: false, yaml: "autoMerge: false\n" });
    const auto = autoMerge();
    await proven();
    await settled(auto);
    expect(m.treeExists()).toBe(true);
    expect(m.logs).toEqual([]);

    await writeFile(join(w.repo.main, ".featra", "config.yaml"), "version: 1\nautoMerge: true\n");
    await settled(auto);
    expect(isMerged(onFeature())).toBe(true);
    stopAll();
  });

  it("leaves it when the app default is off and the project doesn't set it", async () => {
    await m.start({ remote: false });
    const data = await mkdtemp(join(w.repo.root, "data-"));
    await writeFile(join(data, "settings.json"), JSON.stringify({ work: { autoMerge: false } }));
    const auto = autoMerge(undefined, data);
    await proven();
    await settled(auto);
    expect(m.treeExists()).toBe(true);
    stopAll();
    await expect(m.merges.merge(w.repo.main, "STORY-1")).resolves.toEqual({ remains: [] });
  });

  it("merges it once the app default is turned on and the app's settings are saved", async () => {
    await m.start({ remote: false });
    const data = await mkdtemp(join(w.repo.root, "data-"));
    const file = join(data, "settings.json");
    await writeFile(file, JSON.stringify({ work: { autoMerge: false } }));
    const auto = autoMerge(undefined, data);
    await proven();
    await settled(auto);
    expect(m.treeExists()).toBe(true);
    await writeFile(file, JSON.stringify({ work: { autoMerge: true } }));
    // What the server does when the host says the app's settings were saved.
    auto.recheck();
    await settled(auto);
    expect(isMerged(onFeature())).toBe(true);
    stopAll();
  });
});

describe("STORY-59 AC5: the Dev Lead that started the story hears it merged", { timeout: 60_000 }, () => {
  it("gets a merged notice naming the feature branch", async () => {
    await m.start({ remote: false });
    const auto = autoMerge();
    await proven();
    await settled(auto);
    expect(m.notices).toEqual([
      { chat: LEAD, notice: { story: "STORY-1", outcome: "merged", summary: autoMergedSummary(FEATURE_BRANCH, []) } },
    ]);
    stopAll();
  });
});
