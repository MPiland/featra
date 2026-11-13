/**
 * Abandoning a story (STORY-58, ADR 0035): always the user's click. `check` warns what would be lost; `abandon` goes
 * ahead only while the story still matches that warning (its token).
 *
 * In order: the story's turn stops and the story is read again; then its session is retired (the chat stays, as its
 * transcript), its open PR is closed, and in the card lane the card is kept as Cancelled or deleted, committed on the
 * feature branch for a story in its own worktree (which owns it from then on), else written where its owner has it.
 * Only then do the worktree and the branches go. A failure before the card step leaves the story as it was (its session
 * retired, its PR closed); one after leaves notes of what stayed, and the card already says it was abandoned.
 */
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import {
  ABANDON_MESSAGES,
  abandonCommitMessage,
  abandonedStory,
  abandonRefusal,
  sameLocation,
  serializeCard,
  toIso,
  type AbandonWarning,
} from "@featra/work-format";
import { createAbandonGit, type RemoteCopy } from "./abandon-git.ts";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { CheckSettings } from "./check-settings.ts";
import { closePr } from "./github-merge.ts";
import { readPrAt, type GithubPrDeps } from "./github-prs.ts";
import type { runGit } from "./git-run.ts";
import { createMergeGit, REMOVE_NOTES } from "./merge-git.ts";
import { featureBranchOf } from "./merge-settle.ts";
import { createStoryEnding, type StoryEnding } from "./story-ending.ts";
import type { Scan } from "./work-scan.ts";

export interface StoryAbandonDeps extends GithubPrDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  lane?: CardLane;
  settings: Pick<CheckSettings, "githubUse">;
  chats: Pick<ChatManager, "storySession" | "list" | "stop" | "retire">;
  /** The stories being merged or abandoned, which the server shares with Merge. */
  ending?: StoryEnding;
  write?: (file: string, text: string) => Promise<void>;
  /** The platform's git, which a test may stand in for. */
  gitRun?: typeof runGit;
}

/** The story as `check` read it: the warning, and what `abandon` acts on. */
interface Look {
  warning: AbandonWarning;
  /** The token of the git part alone, which closing the PR doesn't change. */
  local: string;
  scan: Scan;
  root: string;
  /** The story's branch, when it has one: its worktree's, else the one its card names. */
  branch: string | null;
  tip: string | null;
  copies: RemoteCopy[];
  kept: string[];
  feature: string | null;
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createStoryAbandon(deps: StoryAbandonDeps) {
  const { scan: scanDir, now, settings, chats, write = writeAtomic } = deps;
  const lane = deps.lane ?? createCardLane();
  const ending = deps.ending ?? createStoryEnding();
  const git = createMergeGit(deps.gitCommand, deps.gitRun);
  const branches = createAbandonGit(git);

  /** The open PR Abandon closes: none in local mode; throws when it was merged meanwhile, or can't be read. */
  async function openPr(dir: string, id: string, url: string | null): Promise<string | null> {
    if (!url || !(await settings.githubUse(dir)).usable) return null;
    const pr = await readPrAt(dir, url, deps);
    if (!pr) throw new ApiError(ABANDON_MESSAGES.noPr(id));
    if (pr.status.state === "merged") throw new ApiError(ABANDON_MESSAGES.merged(id));
    return pr.status.state === "open" ? pr.url : null;
  }

  /** Story `id` read fresh, with what abandoning it would lose; throws why it can't be abandoned. */
  async function look(dir: string, id: string, withPr = true): Promise<Look> {
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    const config = scan?.collected.config;
    if (!scan || !config) throw new ApiError(ABANDON_MESSAGES.gone);
    const refusal = abandonRefusal(found?.owned, id, config, found?.root != null);
    if (refusal !== null || !found?.root) throw new ApiError(refusal ?? ABANDON_MESSAGES.readOnly);
    const { card, owner, path } = found.owned;
    const top = scan.collected.paths.top;
    const inWorktree = owner.kind === "worktree";
    const feature = featureBranchOf(scan, card);
    if (inWorktree && !feature) throw new ApiError(ABANDON_MESSAGES.noFeature(id));
    const branch = inWorktree ? owner.branch : card.branch;
    const tip = branch ? await git.commitOf(top, `refs/heads/${branch}`) : null;
    const files = inWorktree ? await git.uncommitted(found.root, path) : [];
    const lost = tip ? await branches.unpushed(top, tip, feature) : { shas: [], commits: [] };
    const remote = branch ? await branches.remoteCopies(top, branch, tip) : { deletable: [], kept: [] };
    const pr = withPr ? await openPr(dir, id, card.pr) : null;
    const shown = branch !== null && (tip !== null || remote.deletable.length > 0 || inWorktree) ? branch : null;
    const local = digest([found.root, files, lost.shas, tip, remote.deletable, remote.kept]);
    const warning: AbandonWarning = {
      files,
      unpushed: lost.commits,
      pr,
      branch: shown,
      remotes: remote.deletable.map((c) => c.remote),
      token: digest([local, pr]),
    };
    const copies = remote.deletable;
    return { warning, local, scan, root: found.root, branch, tip, copies, kept: remote.kept, feature };
  }

  /** The turn of story `id`'s session stopped, when one runs or waits; the session itself stays for now. */
  async function stopTurn(dir: string, id: string): Promise<string | null> {
    const session = chats.storySession(dir, id);
    const row = session === null ? undefined : chats.list(dir).find((c) => c.id === session);
    if (session !== null && (row?.running || row?.queued)) await chats.stop(session);
    return session;
  }

  /**
   * Keeps the card as Cancelled, or deletes it, on the feature branch, so a story in its own worktree leaves its card
   * there. Throws, with nothing changed, when the branch can't take it.
   */
  async function onFeature(l: Look, id: string, text: string | null, keep: boolean) {
    const { scan } = l;
    const feature = l.feature ?? "";
    const top = scan.collected.paths.top;
    const owned = ownedIn(scan, id)?.owned;
    if (!owned) throw new ApiError(ABANDON_MESSAGES.gone);
    const there = scan.collected.copies.find(
      (c) => c.card?.id === id && sameLocation(c.location, { kind: "feature", branch: feature }),
    );
    const old = await git.commitOf(top, `refs/heads/${feature}`);
    if (!old) throw new ApiError(ABANDON_MESSAGES.noFeature(id));
    const drop = there && there.path !== owned.path ? [there.path] : [];
    const message = abandonCommitMessage(id, keep);
    const made = await git.mergeCommit(top, { parents: [old], path: owned.path, text, message, drop });
    if ("conflicts" in made || !(await git.publish(top, feature, made.commit, old))) {
      throw new ApiError(ABANDON_MESSAGES.featureBusy(feature));
    }
  }

  /** The story's worktree, then its local and remote branches, removed; what stayed, as notes. */
  async function removeBranches(l: Look, inWorktree: boolean): Promise<string[]> {
    const { branch } = l;
    const top = l.scan.collected.paths.top;
    if (inWorktree && !(await git.removeFolder(top, l.root))) {
      return [REMOVE_NOTES.folder(l.root), ...(branch ? [REMOVE_NOTES.branch(branch)] : [])];
    }
    if (!branch) return [];
    const remains: string[] = [];
    if (l.tip !== null) {
      const note = await branches.deleteBranch(top, branch, l.tip);
      if (note !== null) remains.push(note);
    }
    remains.push(...(await branches.deleteCopies(top, branch, l.copies)), ...l.kept);
    return remains;
  }

  /** Abandons story `id`, as the user confirmed with the warning's `token`: its card kept as Cancelled, or deleted. */
  const abandon = (dir: string, id: string, { keep, token }: { keep: boolean; token: string }) =>
    ending.hold(dir, id, "abandon", async () => {
      await look(dir, id);
      const session = await stopTurn(dir, id);
      const seen = await look(dir, id);
      if (seen.warning.token !== token) throw new ApiError(ABANDON_MESSAGES.changed(id));
      if (session !== null) await chats.retire(session);
      if (seen.warning.pr !== null) {
        const closed = await closePr(dir, seen.warning.pr, deps);
        if (closed) throw new ApiError(closed.error);
      }
      return lane.exclusive(async () => {
        // Read again in the lane, past the PR: its session is gone, so nothing new should be here.
        const l = await look(dir, id, false);
        if (l.local !== seen.local) throw new ApiError(ABANDON_MESSAGES.changed(id));
        const owned = ownedIn(l.scan, id)?.owned;
        if (!owned) throw new ApiError(ABANDON_MESSAGES.gone);
        const inWorktree = owned.owner.kind === "worktree";
        const text = keep ? serializeCard(abandonedStory(owned.card, "user", toIso(now()))) : null;
        if (inWorktree) await onFeature(l, id, text, keep);
        // The owner's copy says it too, so a worktree that stays reads as abandoned.
        const file = fileIn(l.root, owned.path);
        if (text === null) await rm(file, { force: true });
        else await write(file, text);
        const remains = await removeBranches(l, inWorktree);
        await scanDir(dir);
        return { remains };
      });
    });

  return {
    /** What abandoning story `id` would lose, as the user is warned before confirming it. */
    check: async (dir: string, id: string): Promise<AbandonWarning> => {
      const busy = ending.busy(dir, id);
      if (busy !== null) throw new ApiError(busy);
      return (await look(dir, id)).warning;
    },
    abandon,
  };
}

export type StoryAbandon = ReturnType<typeof createStoryAbandon>;
