/**
 * The world of the abandon tests (STORY-58): the merge world (a real repository with FEAT-1's branch and STORY-1's
 * worktree, the real scanner, watches, settings and PR poller; GitHub as the fake `gh` over a bare remote), with the
 * real abandon module on it, sharing one ending gate. Only the platform is faked: GitHub, the clock, and the chat
 * manager, which records the turns it was asked to stop and the sessions it retired.
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach } from "vitest";
import { parseCard, type Card } from "@featra/work-format";
import { createStoryAbandon, type StoryAbandon } from "../src/story-abandon.ts";
import { createStoryEnding, type StoryEnding } from "../src/story-ending.ts";
import type { Scan } from "../src/work-scan.ts";
import { cardPath } from "./card-repo.ts";
import type { PrStartOptions } from "./story-prs-world.ts";
import { FEATURE_BRANCH, mergeWorld, SESSION, STORY_BRANCH, type MergeWorld } from "./story-merge-world.ts";

export { FEATURE_BRANCH, SESSION, STORY_BRANCH };

export const PR = "https://github.com/acme/app/pull/1";

export interface AbandonWorld {
  m: MergeWorld;
  abandons: StoryAbandon;
  ending: StoryEnding;
  /** The sessions whose turn Abandon stopped, in order, with `retired` from the merge world beside it. */
  stopped: string[];
  /** Each stop and retire, in the order the chat manager was asked. */
  order: string[];
  start: (options?: PrStartOptions) => Promise<void>;
  check: (id?: string) => ReturnType<StoryAbandon["check"]>;
  abandon: (keep: boolean, token: string, id?: string) => ReturnType<StoryAbandon["abandon"]>;
  /** A file in STORY-1's worktree, left uncommitted. */
  scratch: (file: string) => Promise<void>;
  /** A commit in STORY-1's worktree, never pushed. */
  commitInTree: (file: string, message: string) => Promise<void>;
  /** The card as a branch's tip has it, or null when the branch has none. */
  cardOn: (branch: string, id?: string) => Card | null;
  scan: () => Promise<Scan | null>;
  treeExists: () => boolean;
}

export function abandonWorld(): AbandonWorld {
  const m = mergeWorld();
  const { w } = m;
  const a = { m } as AbandonWorld;

  beforeEach(() => {
    a.stopped = [];
    a.order = [];
  });

  a.start = async (options = {}) => {
    await m.start(options);
    a.ending = createStoryEnding();
    a.abandons = createStoryAbandon({
      scan: w.watches.scan,
      now: w.clock.now,
      settings: w.settings,
      chats: {
        ...m.chats,
        retire: async (id) => {
          a.order.push(`retire:${id}`);
          await m.chats.retire(id);
        },
        stop: async (id) => {
          a.order.push(`stop:${id}`);
          a.stopped.push(id);
          m.running = false;
        },
      },
      ending: a.ending,
      ghCommand: options.noGh ? "gh-that-is-not-installed" : w.gh.command,
    });
  };
  a.check = (id = "STORY-1") => a.abandons.check(w.repo.main, id);
  a.abandon = (keep, token, id = "STORY-1") => a.abandons.abandon(w.repo.main, id, { keep, token });
  a.scratch = async (file) => {
    await writeFile(join(w.tree, file), "unsaved\n");
  };
  a.commitInTree = async (file, message) => {
    await writeFile(join(w.tree, file), `${message}\n`);
    w.repo.git(w.tree, "add", file);
    w.repo.git(w.tree, "commit", "-q", "-m", message);
  };
  a.cardOn = (branch, id = "STORY-1") => {
    try {
      return parseCard(w.repo.show(w.repo.main, branch, id), cardPath(id));
    } catch {
      return null;
    }
  };
  a.scan = () => w.watches.scan(w.repo.main);
  a.treeExists = () => existsSync(w.tree);
  return a;
}
