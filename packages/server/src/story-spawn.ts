/**
 * Starting a story's agent (STORY-9, ADR 0025). The story's worktree is cut from its feature's branch where the
 * provider keeps worktrees, and the story card there, In Progress with its agent, model and session, is left
 * uncommitted: a story with a live worktree belongs to it (`ownerOf`), so ownership moves by the ordinary rules. A normal
 * chat session through the provider interface then starts in the worktree, nested under the Dev Lead's chat.
 * A story added to a started feature after it started is first committed onto the feature branch with the card-only
 * plumbing commit (ADR 0024), so the worktree can be cut from a branch that has it.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  draftedBy,
  notSpawnableReason,
  serializeCard,
  spawner,
  STORY_ROLE,
  startedStory,
  storyBranchName,
  storyFirstMessage,
  storyFolderName,
  toIso,
  type Card,
  type SpawnInput,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { commitCard } from "./card-commit.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import { fileIn, writeAtomic } from "./card-actions.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { StoryPrep } from "./chat-stories.ts";
import { failed, runGit, type GitOptions, type Run } from "./git-run.ts";
import type { Scan } from "./work-scan.ts";

export const SPAWN_MESSAGES = {
  notProject: "This folder isn't a Featra project in git.",
  queued: (id: string) => `${id} is already queued.`,
  /** `remains` says what a failed start couldn't take back; empty when it left nothing. */
  failed: (id: string, why: string, remains: readonly string[] = []) =>
    [`Couldn't start ${id}.`, why, ...remains].join(" "),
  inUse: (id: string, branch: string) => `${id}'s branch ${branch} is checked out in another worktree.`,
  cardAdded: (branch: string) => `Its card was added to ${branch}.`,
  folderStays: (folder: string) => `The worktree ${folder} is still there.`,
} as const;

export interface StorySpawnDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
  chats: Pick<ChatManager, "startStory" | "queuedStory">;
  /** The git command (default `git`). */
  gitCommand?: string;
}

export interface SpawnResult {
  chat: string;
  queued: boolean;
}

/** What `prepare` made, and how to take it back: a started session that never ran leaves nothing behind. */
export interface Prepared {
  cwd: string;
  first: string;
  undo: () => Promise<void>;
}

/** The card, its feature and the feature's branch, as the scan has them. */
function situation(scan: Scan | null, id: string) {
  const top = scan?.collected.paths.top ?? null;
  const owned = scan?.resolution.cards.find((c) => c.card.id === id);
  const feature = scan?.resolution.cards.find((c) => c.card.id === owned?.card.parent)?.card;
  const featureBranch = feature ? (scan?.collected.state.features[feature.id]?.branch ?? null) : null;
  return { top, owned, feature, featureBranch };
}

export function createStorySpawn({
  scan: scanDir,
  now,
  lane = createCardLane(),
  chats,
  gitCommand = "git",
}: StorySpawnDeps) {
  const git = (root: string, args: string[], options?: GitOptions) => runGit(gitCommand, root, args, options);
  const must = async (root: string, args: string[], options?: GitOptions): Promise<Run> => {
    const r = await git(root, args, options);
    if (r.code !== 0) throw failed(`git ${args[0] ?? ""}`, r);
    return r;
  };

  /** Adds the provider's worktree folder to the repository's `info/exclude`, once. */
  async function exclude(top: string, pattern: string) {
    // Absolute, whatever the checkout: in a linked worktree the path is the repository's own `info/exclude`.
    const where = (
      await must(top, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"])
    ).stdout.trim();
    const file = resolve(top, where);
    const have = await readFile(file, "utf8").catch(() => "");
    if (have.split(/\r?\n/).some((line) => line.trim() === pattern)) return;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${have}${have === "" || have.endsWith("\n") ? "" : "\n"}${pattern}\n`, "utf8");
  }

  /** The branches checked out in some worktree of the repository. */
  async function checkedOut(top: string): Promise<Set<string>> {
    const trees = (await must(top, ["worktree", "list", "--porcelain"])).stdout;
    return new Set(
      trees
        .split(/\r?\n/)
        .filter((l) => l.startsWith("branch refs/heads/"))
        .map((l) => l.slice("branch refs/heads/".length)),
    );
  }

  /**
   * Makes sure the feature branch has the story's card (note 3 of the card): a story added after the feature started is
   * only in main. A branch nobody has checked out gets a card-only commit; one that is checked out is left alone, and
   * the card is written into the new worktree anyway. True when it committed.
   */
  async function onFeatureBranch(top: string, branch: string, path: string, card: Card): Promise<boolean> {
    const has = await git(top, ["cat-file", "-e", `refs/heads/${branch}:${path}`]);
    if (has.code === 0 || (await checkedOut(top)).has(branch)) return false;
    const { commit, parent } = await commitCard(
      must,
      top,
      `refs/heads/${branch}`,
      path,
      serializeCard(card),
      `${card.id}: added to ${card.parent}`,
    );
    await must(top, ["update-ref", `refs/heads/${branch}`, commit, parent]);
    return true;
  }

  /** Makes the story's worktree and card, and says where the agent works and what its first message is. */
  async function prepare(dir: string, input: SpawnInput, by: string, prep: StoryPrep): Promise<Prepared> {
    const { role, settings, spot } = prep;
    const { top, owned, feature, featureBranch } = situation(await scanDir(dir), input.story);
    const refusal = notSpawnableReason(owned?.card, feature, featureBranch, input.story);
    if (refusal !== null || !top || !owned || !featureBranch) throw new ApiError(refusal ?? SPAWN_MESSAGES.notProject);
    const folder = spot.folder(top, storyFolderName(owned.card));
    const branch = storyBranchName(owned.card);
    const remains: string[] = [];
    let made = false;
    let created = false;
    /** Takes back the worktree, and the branch when this start made it. What it can't take back it says. */
    const rollback = async () => {
      if (made) {
        const gone = await git(top, ["worktree", "remove", "--force", folder]);
        if (gone.code !== 0) remains.push(SPAWN_MESSAGES.folderStays(folder));
        made = false;
      }
      if (created) await git(top, ["branch", "-D", branch]);
      created = false;
    };
    try {
      if (await onFeatureBranch(top, featureBranch, owned.path, owned.card)) {
        remains.push(SPAWN_MESSAGES.cardAdded(featureBranch));
      }
      if (spot.ignore) await exclude(top, spot.ignore);
      // A branch left from an earlier start is reused when no worktree has it; otherwise it is cut from the feature's.
      const left = (await git(top, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])).code === 0;
      if (left && (await checkedOut(top)).has(branch)) throw new ApiError(SPAWN_MESSAGES.inUse(input.story, branch));
      created = !left;
      await must(
        top,
        left ? ["worktree", "add", folder, branch] : ["worktree", "add", "-b", branch, folder, featureBranch],
      );
      made = true;
      // The card as the scan has it (the owner's copy, with any edits not yet committed), made In Progress.
      const started = startedStory(
        owned.card,
        {
          agent: role.provider,
          role: role.id,
          model: settings.model,
          reasoning: settings.effort,
          session: prep.chat,
          branch,
        },
        by,
        toIso(now()),
      );
      const file = fileIn(folder, owned.path);
      await mkdir(dirname(file), { recursive: true });
      await writeAtomic(file, serializeCard(started));
      const first = storyFirstMessage({ card: started, branch, worktree: folder, brief: input.brief ?? null });
      return { cwd: folder, first, undo: () => lane.exclusive(rollback) };
    } catch (err) {
      await rollback();
      if (err instanceof ApiError) throw err;
      throw new ApiError(SPAWN_MESSAGES.failed(input.story, err instanceof Error ? err.message : String(err), remains));
    }
  }

  async function spawn(
    dir: string,
    input: SpawnInput,
    parent: string | null,
    by: string,
    known?: Scan | null,
  ): Promise<SpawnResult> {
    const scan = known ?? (await scanDir(dir));
    const { top, owned, feature, featureBranch } = situation(scan, input.story);
    const refusal = notSpawnableReason(owned?.card, feature, featureBranch, input.story);
    if (refusal !== null || !top || !feature) throw new ApiError(refusal ?? SPAWN_MESSAGES.notProject);
    if (chats.queuedStory(dir, input.story)) throw new ApiError(SPAWN_MESSAGES.queued(input.story));
    return chats.startStory({
      dir,
      // The caller's role, else the one the card names, else the developer.
      roleId: input.role ?? owned?.card.role ?? STORY_ROLE,
      ...(input.model ? { model: input.model } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
      story: { id: input.story, parent, feature: feature.id, featureTitle: feature.title },
      title: `${input.story} ${owned?.card.title ?? ""}`.trim(),
      prepare: (prep) => lane.exclusive(() => prepare(dir, input, by, prep)),
    });
  }

  return {
    /** Starts the story for the Dev Lead chat `chat` (the MCP's caller). */
    spawn: (dir: string, input: SpawnInput, chat: string): Promise<SpawnResult> =>
      spawn(dir, input, chat, spawner(chat)),
    /** The Start button: the feature's own chat is the Dev Lead, when it is still open. */
    async start(dir: string, id: string, role?: string): Promise<SpawnResult> {
      const scan = await scanDir(dir);
      const { feature } = situation(scan, id);
      // Its chat, even if it is gone from the list: the sidebar then groups the session under the feature's name.
      const input = { story: id, ...(role ? { role } : {}) };
      return spawn(dir, input, feature ? draftedBy(feature) : null, spawner(null), scan);
    },
  };
}

export type StorySpawn = ReturnType<typeof createStorySpawn>;
