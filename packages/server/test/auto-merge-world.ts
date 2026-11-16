/**
 * The world of the auto-merge tests (STORY-59, STORY-60): the merge world (a real repository with FEAT-1's branch and
 * STORY-1's worktree, the real scanner, watches, card lane, merge and settle) with the real auto-merge on it, which
 * records on the card, through the real recorder, a merge that didn't happen. Only the platform is faked: the chat
 * manager, which records the notices, GitHub and the clock. The setting is read from the project's config and the
 * app's settings file on disk, as the server reads it.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCard, withCheckEvidence } from "@featra/work-format";
import { createAutoMerge, type AutoMerge } from "../src/auto-merge.ts";
import { createCardLane } from "../src/card-lane.ts";
import { readAutoMerge } from "../src/mcp-enabled.ts";
import { recordNotMerged } from "../src/not-merged-record.ts";
import { FEATURE_BRANCH, mergeWorld, STORY_BRANCH } from "./story-merge-world.ts";
import { storyCard } from "./story-prs-world.ts";

const STORY_2_BRANCH = "featra/story-2-more";

export function autoMergeWorld() {
  const m = mergeWorld();
  const { w } = m;
  const autos: AutoMerge[] = [];
  const lane = createCardLane();

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
      record: (dir, id, tried, reason) =>
        recordNotMerged({ scan: w.watches.scan, lane, now: w.clock.now }, dir, id, tried, reason),
      log: (line) => m.logs.push(line),
    });
    autos.push(auto);
    return auto;
  }

  const config = async () => (await w.watches.scan(w.repo.main))!.collected.config;
  /** The evidence of a passing run on `head` that proves every criterion, written in the story's worktree `tree`. */
  async function provenAt(tree: string, id: string, head: string) {
    const card = parseCard(await w.repo.read(tree, id));
    const outcome = { passed: true, acs: card.acs.map((_, i) => ({ ac: i + 1, passed: true })), head };
    await w.repo.write(tree, withCheckEvidence(card, await config(), outcome, "system", w.clock.now().toISOString()));
    await w.settle();
  }
  /** STORY-1 with committed work, in `status`, Verified and Proven for its branch's tip. */
  async function proven(status = "In Review", file?: string) {
    await m.verified(status, file);
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

  return { m, w, autoMerge, provenAt, proven, onFeature, settled, stopAll, twoProven };
}
