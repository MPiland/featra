/**
 * How stories end, wired: merged into their feature (STORY-12), on their own while the project's auto-merge is on
 * (STORY-59), or abandoned (STORY-58). A story that is ending takes no message, Send back or Resume, since its session
 * is about to end, and its dev server stops before its worktree goes (STORY-25).
 */
import { createAutoMerge, type AutoMergeDeps } from "./auto-merge.ts";
import type { CardLane } from "./card-lane.ts";
import type { GithubPrDeps } from "./github-prs.ts";
import { readAutoMerge } from "./mcp-enabled.ts";
import { recordNotMerged } from "./not-merged-record.ts";
import { createStoryAbandon, type StoryAbandonDeps } from "./story-abandon.ts";
import { createStoryEnding } from "./story-ending.ts";
import { createStoryMerge, type StoryMergeDeps } from "./story-merge.ts";

export interface StoryEndServicesDeps {
  scan: StoryMergeDeps["scan"];
  observe: AutoMergeDeps["observe"];
  allowed: AutoMergeDeps["allowed"];
  now: () => Date;
  lane: CardLane;
  log: (message: string) => void;
  /** The app's data folder, whose settings hold the auto-merge default. */
  dataDir: string | undefined;
  settings: StoryMergeDeps["settings"] & StoryAbandonDeps["settings"];
  chats: StoryMergeDeps["chats"] & StoryAbandonDeps["chats"] & AutoMergeDeps["chats"];
  checkedHead: StoryMergeDeps["checkedHead"];
  onGithubMerge: NonNullable<StoryMergeDeps["onGithubMerge"]>;
  gh: GithubPrDeps;
  /** Stops story `id`'s dev server as it starts to end. */
  stopDevServer: (dir: string, id: string) => void;
}

export function createStoryEndServices(deps: StoryEndServicesDeps) {
  const { scan, now, lane, log, settings, chats, gh } = deps;
  const ending = createStoryEnding(deps.stopDevServer);
  const merges = createStoryMerge({
    scan,
    now,
    lane,
    log,
    settings,
    chats,
    checkedHead: deps.checkedHead,
    ...gh,
    ending,
    onGithubMerge: deps.onGithubMerge,
  });
  const autoMerges = createAutoMerge({
    observe: deps.observe,
    allowed: deps.allowed,
    enabled: readAutoMerge(deps.dataDir),
    merge: merges.merge,
    chats,
    record: (dir, id, tried, reason) => recordNotMerged({ scan, lane, now }, dir, id, tried, reason),
    log,
  });
  const abandons = createStoryAbandon({ scan, now, lane, settings, chats, ...gh, ending });
  return { busy: ending.busy, merges, autoMerges, abandons };
}
