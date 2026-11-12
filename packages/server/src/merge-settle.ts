/**
 * What follows a story's merge (STORY-12, ADR 0034), whether Featra merged it or its PR was merged on GitHub: its
 * session ends and stays as its transcript, the card records `merged` by `system` on the feature branch, which owns it
 * from then on, and the story's worktree and its local and remote branches go. Featra deletes the remote branch with
 * `git push --delete`, not `gh pr merge --delete-branch`, which also changes local checkouts.
 *
 * Nothing is lost: the worktree's changes were refused before a merge Featra made, and when the feature branch can't
 * take the card (after a merge on GitHub), the worktree stays, with the card that says it merged.
 */
import { mergedStory, serializeCard, toIso } from "@featra/work-format";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import type { CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { GithubRemote } from "./github-detect.ts";
import { REMOVE_NOTES, type MergeGit } from "./merge-git.ts";
import type { Scan } from "./work-scan.ts";

export interface MergeSettleDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  lane: CardLane;
  chats: Pick<ChatManager, "storySession" | "retire">;
  git: MergeGit;
  write?: (file: string, text: string) => Promise<void>;
}

/** What a merge left behind, as the user is told it; empty when it all went. */
export interface MergeResult {
  remains: string[];
}

export const SETTLE_NOTES = {
  feature: (branch: string) => `${branch} couldn't take the card. Pull it, then merge again.`,
} as const;

/** The card commit's message on the feature branch, after a merge on GitHub. */
const cardMessage = (id: string, into: string) => `${id}: merged into ${into}`;

export function createMergeSettle({ scan: scanDir, now, lane, chats, git, write = writeAtomic }: MergeSettleDeps) {
  /**
   * Commits the merged card onto the local feature branch, on top of the feature branch as GitHub has it now (which
   * has the PR's merge commit). Null once done, else why not; nothing changes then.
   */
  async function cardOnFeature(top: string, remote: string, into: string, path: string, text: string, id: string) {
    const remoteTip = await git.fetchTip(top, remote, into);
    const local = await git.commitOf(top, `refs/heads/${into}`);
    if (!remoteTip || !local) return SETTLE_NOTES.feature(into);
    const parents = (await git.isAncestor(top, local, remoteTip))
      ? [remoteTip]
      : (await git.isAncestor(top, remoteTip, local))
        ? [local]
        : [local, remoteTip];
    const made = await git.mergeCommit(top, { parents, path, text, message: cardMessage(id, into) });
    if ("conflicts" in made || !(await git.publish(top, into, made.commit, local))) return SETTLE_NOTES.feature(into);
    return null;
  }

  /**
   * Settles story `id`, merged into `into`: on GitHub through `remote`, or locally (null), where the merge commit has
   * the card already. Does nothing for a story whose worktree is gone.
   */
  async function settle(dir: string, id: string, into: string, remote: GithubRemote | null): Promise<MergeResult> {
    const session = chats.storySession(dir, id);
    if (session !== null) await chats.retire(session);
    return lane.exclusive(async () => {
      const scan = await scanDir(dir);
      const found = ownedIn(scan, id);
      if (!scan || !found?.root || found.owned.owner.kind !== "worktree") return { remains: [] };
      const { card, path, owner } = found.owned;
      const text = serializeCard(mergedStory(card, into, "system", toIso(now())));
      await write(fileIn(found.root, path), text);
      const top = scan.collected.paths.top;
      if (remote) {
        const note = await cardOnFeature(top, remote.name, into, path, text, id);
        if (note !== null) {
          await scanDir(dir);
          return { remains: [note, REMOVE_NOTES.folder(found.root)] };
        }
      }
      const { remains } = await git.removeStory(top, found.root, owner.branch, into);
      if (remote) {
        const note = await git.deleteRemote(top, remote.name, owner.branch);
        if (note !== null) remains.push(note);
      }
      await scanDir(dir);
      return { remains };
    });
  }

  return { settle };
}

export type MergeSettle = ReturnType<typeof createMergeSettle>;
