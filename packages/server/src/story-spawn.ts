/**
 * Starting a story's agent (STORY-9, ADR 0025). The story's worktree is cut from its feature's branch where the
 * provider keeps worktrees, and the story card there, In Progress with its agent, model and session, is left
 * uncommitted: a story with a live worktree belongs to it (`ownerOf`), so ownership moves by the ordinary rules. A normal
 * chat session through the provider interface then starts in the worktree, nested under the Dev Lead's chat.
 * A story added to a started feature after it started is first committed onto the feature branch with the card-only
 * plumbing commit (ADR 0024), so the worktree can be cut from a branch that has it.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  draftedBy,
  notSpawnableReason,
  parseCard,
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
  failed: (id: string, why: string) => `Couldn't start ${id}; nothing was changed. ${why}`,
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
    const file = join(top, (await must(top, ["rev-parse", "--git-path", "info/exclude"])).stdout.trim());
    const have = await readFile(file, "utf8").catch(() => "");
    if (have.split(/\r?\n/).some((line) => line.trim() === pattern)) return;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${have}${have === "" || have.endsWith("\n") ? "" : "\n"}${pattern}\n`, "utf8");
  }

  /**
   * Makes sure the feature branch has the story's card (note 3 of the card): a story added after the feature started is
   * only in main. A branch nobody has checked out gets a card-only commit; one that is checked out is left alone and
   * the card is written into the worktree instead. Returns the text to write there, or null when the branch has it.
   */
  async function onFeatureBranch(top: string, branch: string, path: string, card: Card): Promise<string | null> {
    const has = await git(top, ["cat-file", "-e", `refs/heads/${branch}:${path}`]);
    if (has.code === 0) return null;
    const text = serializeCard(card);
    const trees = (await must(top, ["worktree", "list", "--porcelain"])).stdout;
    if (trees.split(/\r?\n/).includes(`branch refs/heads/${branch}`)) return text;
    const { commit, parent } = await commitCard(
      must,
      top,
      `refs/heads/${branch}`,
      path,
      text,
      `${card.id}: added to ${card.parent}`,
    );
    await must(top, ["update-ref", `refs/heads/${branch}`, commit, parent]);
    return null;
  }

  /** Makes the story's worktree and card, and says where the agent works and what its first message is. */
  async function prepare(dir: string, input: SpawnInput, by: string, prep: StoryPrep) {
    const { adapter, role, settings } = prep;
    const spot = adapter.worktrees;
    if (!spot) throw new ApiError("This role's agent can't run story sessions yet.");
    const scan = await scanDir(dir);
    const { top, owned, feature, featureBranch } = situation(scan, input.story);
    const refusal = notSpawnableReason(owned?.card, feature, featureBranch, input.story);
    if (refusal !== null || !top || !owned || !featureBranch) throw new ApiError(refusal ?? SPAWN_MESSAGES.notProject);
    const folder = spot.folder(top, storyFolderName(owned.card));
    const branch = storyBranchName(owned.card);
    try {
      const copy = await onFeatureBranch(top, featureBranch, owned.path, owned.card);
      if (spot.ignore) await exclude(top, spot.ignore);
      await must(top, ["worktree", "add", "-b", branch, folder, featureBranch]);
      try {
        const file = fileIn(folder, owned.path);
        const text = copy ?? (await readFile(file, "utf8"));
        const story = startedStory(
          parseCard(text, owned.path),
          { agent: role.id, model: settings.model, reasoning: settings.effort, session: prep.chat, branch },
          by,
          toIso(now()),
        );
        await mkdir(dirname(file), { recursive: true });
        await writeAtomic(file, serializeCard(story));
        const first = storyFirstMessage({
          template: role.prompt,
          card: story,
          branch,
          worktree: folder,
          brief: input.brief ?? null,
        });
        return { cwd: folder, first };
      } catch (err) {
        await git(top, ["worktree", "remove", "--force", folder]);
        await git(top, ["branch", "-D", branch]);
        throw err;
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(SPAWN_MESSAGES.failed(input.story, err instanceof Error ? err.message : String(err)));
    }
  }

  async function spawn(dir: string, input: SpawnInput, parent: string | null, by: string): Promise<SpawnResult> {
    const scan = await scanDir(dir);
    const { top, owned, feature, featureBranch } = situation(scan, input.story);
    const refusal = notSpawnableReason(owned?.card, feature, featureBranch, input.story);
    if (refusal !== null || !top || !feature) throw new ApiError(refusal ?? SPAWN_MESSAGES.notProject);
    if (chats.queuedStory(dir, input.story)) throw new ApiError(SPAWN_MESSAGES.queued(input.story));
    return chats.startStory({
      dir,
      roleId: input.role,
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
    async start(dir: string, id: string, role: string = STORY_ROLE): Promise<SpawnResult> {
      const { feature } = situation(await scanDir(dir), id);
      // Its chat, even if it is gone from the list: the sidebar then groups the session under the feature's name.
      return spawn(dir, { story: id, role }, feature ? draftedBy(feature) : null, spawner(null));
    },
  };
}

export type StorySpawn = ReturnType<typeof createStorySpawn>;
