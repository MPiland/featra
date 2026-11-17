/**
 * STORY-60: an automatic merge that fails. The real auto-merge on the merge world (auto-merge-world.ts): a real
 * repository, the real scanner, watches, card lane, merge, conflict path and recorder; only the platform is faked: the
 * chat manager, which records what the session is sent and the Dev Lead's notices, GitHub (fake-gh.cjs) and the clock.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMerged, MERGE_MESSAGES, notMergedOf, notMergedSummary, type Card } from "@featra/work-format";
import { autoMergeWorld } from "./auto-merge-world.ts";
import { FEATURE_BRANCH, LEAD, SESSION, STORY_BRANCH } from "./story-merge-world.ts";

const { m, w, autoMerge, provenAt, proven, onFeature, settled, stopAll } = autoMergeWorld();

const BRANCH_RULE = "X Pull request acme/app#1 is not mergeable: the base branch policy prohibits the merge.";
const lastNotMerged = (card: Card) => card.history.findLast((e) => e.field === "not-merged");
const notMergedEvents = (card: Card) => card.history.filter((e) => e.field === "not-merged");

/** STORY-1 Proven at a commit whose work.txt conflicts with the feature branch's, which is at `base` before it tries. */
async function conflicting() {
  await m.start({ remote: false });
  await m.onFeature("work.txt", "feature's\n");
  const base = m.tip(FEATURE_BRANCH);
  const auto = autoMerge();
  await proven();
  await settled(auto);
  return { auto, base };
}

/** STORY-1 Proven, with its PR open on GitHub, which refuses to merge it for its branch rules. */
async function refusedOnGithub() {
  await m.start({ gh: { mergeFails: BRANCH_RULE } });
  const auto = autoMerge();
  await proven();
  await settled(auto);
  return auto;
}

describe(
  "STORY-60 AC1: on a conflict nothing merges, and the story goes back with its files",
  { timeout: 60_000 },
  () => {
    it("leaves the feature branch, moves the story to In Progress and sends its session the files, as Merge does", async () => {
      const { base } = await conflicting();

      expect(m.tip(FEATURE_BRANCH)).toBe(base);
      expect(m.treeExists()).toBe(true);
      const card = await w.read();
      expect(isMerged(card)).toBe(false);
      expect(card.status).toBe("In Progress");
      expect(card.history.findLast((e) => e.field === "status")).toMatchObject({ to: "In Progress", by: "system" });
      expect(m.sent.map((s) => s.chat)).toEqual([SESSION]);
      expect(m.sent[0]?.text).toContain("- work.txt");
      stopAll();
    });
  },
);

describe(
  "STORY-60 AC2: the Dev Lead that started the story hears it didn't merge, and why",
  { timeout: 60_000 },
  () => {
    it("gets a not merged notice with the conflict", async () => {
      await conflicting();
      const why = MERGE_MESSAGES.conflict("STORY-1", ["work.txt"], "In Progress");
      expect(m.notices).toEqual([
        {
          chat: LEAD,
          notice: { story: "STORY-1", outcome: "not merged", summary: notMergedSummary(FEATURE_BRANCH, why) },
        },
      ]);
      stopAll();
    });

    it("gets a not merged notice with GitHub's refusal", async () => {
      await refusedOnGithub();
      expect(m.notices).toHaveLength(1);
      const { chat, notice } = m.notices[0]!;
      expect(chat).toBe(LEAD);
      expect(notice).toMatchObject({ story: "STORY-1", outcome: "not merged" });
      expect(notice.summary).toMatch(/^feature\/1-\S+, on its own\. .*base branch policy prohibits the merge/);
      stopAll();
    });

    it("gets a not merged notice for work left uncommitted, which Merge refuses", async () => {
      await m.start({ remote: false });
      const auto = autoMerge();
      await m.verified();
      await writeFile(join(w.tree, "more.txt"), "more\n");
      await provenAt(w.tree, "STORY-1", m.tip(STORY_BRANCH));
      await settled(auto);
      const why = MERGE_MESSAGES.dirty("STORY-1", ["more.txt"]);
      expect(m.notices).toEqual([
        {
          chat: LEAD,
          notice: { story: "STORY-1", outcome: "not merged", summary: notMergedSummary(FEATURE_BRANCH, why) },
        },
      ]);
      stopAll();
    });

    it("isn't told, and nothing is recorded, when the story's session starts a turn as its merge begins", async () => {
      await m.start({ remote: false });
      // The session starts a turn after auto-merge looked, so the merge itself finds it working.
      const busyAtMerge = async (dir: string, id: string) => {
        m.running = true;
        return m.merges.merge(dir, id);
      };
      let auto = autoMerge(busyAtMerge);
      await proven();
      await settled(auto);
      expect(m.notices).toEqual([]);
      expect(notMergedEvents(await w.read())).toEqual([]);
      expect(m.treeExists()).toBe(true);
      stopAll();

      // Once the session is idle, it is tried again and merges.
      m.running = false;
      auto = autoMerge();
      m.chatsChanged();
      await settled(auto);
      expect(isMerged(onFeature())).toBe(true);
      stopAll();
    });
  },
);

describe(
  "STORY-60 AC3: a refusal that isn't a conflict leaves the story, with the reason on its card, untried until it changes",
  { timeout: 60_000 },
  () => {
    it("keeps the story in review and records why on its card, by system, at the commit tried", async () => {
      await refusedOnGithub();
      const card = await w.read();
      expect(card.status).toBe("In Review");
      expect(isMerged(card)).toBe(false);
      expect(m.sent).toEqual([]);
      const event = lastNotMerged(card);
      expect(event).toMatchObject({ from: m.tip(STORY_BRANCH), by: "system" });
      expect(event?.to).toMatch(/base branch policy prohibits the merge/);
      expect(notMergedOf(card)).toEqual({ head: m.tip(STORY_BRANCH), reason: event?.to });
      stopAll();
    });

    it("isn't tried again on rescans, a recheck, a chat change or a restart", async () => {
      const auto = await refusedOnGithub();
      expect(await w.callsOf("pr merge")).toHaveLength(1);
      await w.moveOn("Acceptance");
      auto.recheck();
      m.chatsChanged();
      await settled(auto);
      stopAll();
      // A restart: a new auto-merge, which knows only what the card says.
      const again = autoMerge();
      await settled(again);
      expect(await w.callsOf("pr merge")).toHaveLength(1);
      expect(m.notices).toHaveLength(1);
      expect(notMergedEvents(await w.read())).toHaveLength(1);
      stopAll();
    });

    it("is tried again after a restart once its checks settle on a new commit, and merges", async () => {
      await m.start({ remote: false });
      const auto = autoMerge();
      await m.verified();
      await writeFile(join(w.tree, "more.txt"), "more\n");
      await provenAt(w.tree, "STORY-1", m.tip(STORY_BRANCH));
      await settled(auto);
      expect(m.logs).toEqual([`STORY-1 didn't merge on its own: ${MERGE_MESSAGES.dirty("STORY-1", ["more.txt"])}`]);
      stopAll();

      const restarted = autoMerge();
      await settled(restarted);
      expect(m.logs).toHaveLength(1);
      expect(m.treeExists()).toBe(true);

      w.repo.commit(w.tree, "more");
      await provenAt(w.tree, "STORY-1", m.tip(STORY_BRANCH));
      await settled(restarted);
      expect(isMerged(onFeature())).toBe(true);
      expect(notMergedOf(onFeature())).toBeNull();
      expect(m.logs).toHaveLength(1);
      stopAll();
    });
  },
);

describe("STORY-60 AC4: the card says the automatic merge didn't happen and why", { timeout: 60_000 }, () => {
  it("records a conflict on the card, after the story's move back", async () => {
    await conflicting();
    const card = await w.read();
    const why = MERGE_MESSAGES.conflict("STORY-1", ["work.txt"], "In Progress");
    expect(card.history.at(-1)).toMatchObject({ field: "not-merged", to: why, by: "system" });
    expect(notMergedOf(card)?.reason).toBe(why);
    stopAll();
  });

  it("records GitHub's own reason, without gh's failure mark or its PR prefix (design review)", async () => {
    await refusedOnGithub();
    const card = await w.read();
    expect(lastNotMerged(card)?.to).toBe("The base branch policy prohibits the merge.");
    expect(m.notices[0]?.notice.summary).toBe(
      notMergedSummary(FEATURE_BRANCH, "The base branch policy prohibits the merge."),
    );
    stopAll();
  });
});
