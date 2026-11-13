/**
 * What follows a story's merge (STORY-12, ADR 0034), whether Featra merged it or its PR was merged on GitHub: its
 * session ends and stays as its transcript, the card records `merged` by `system` on the feature branch, which owns it
 * from then on, and the story's worktree and its local and remote branches go. Featra deletes the remote branch with
 * `git push --delete`, not `gh pr merge --delete-branch`, which also changes local checkouts.
 *
 * Nothing is lost. The worktree is checked again once its session has ended, so a PR merged outside Featra, or a turn
 * that ran meanwhile, never has its uncommitted work removed: the worktree stays, and the user is told. When the
 * feature branch can't take the card (after a merge on GitHub), nothing changes, so merging again (or the PR poller)
 * settles it later.
 */
import { mergedStory, serializeCard, toIso, type Card } from "@featra/work-format";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import type { CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { GithubRemote } from "./github-detect.ts";
import type { MergeGit } from "./merge-git.ts";
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
  ahead: (branch: string, commits: number) =>
    `${branch} is ${commits === 1 ? "one commit" : `${commits} commits`} ahead of GitHub; push it.`,
} as const;

/** The branch story `card` merges into: its feature's, while that isn't merged itself; null when there is none. */
export function featureBranchOf(scan: Scan | null, card: Card | undefined): string | null {
  const feature = card?.parent ? scan?.collected.state.features[card.parent] : undefined;
  return feature && !feature.merged ? feature.branch : null;
}

/** The card commit's message on the branch a card merged into, after a merge on GitHub. */
export const cardMessage = (id: string, into: string) => `${id}: merged into ${into}`;

/**
 * Commits a merged card onto the local branch `into`, on top of `into` as GitHub has it now (which has the PR's merge
 * commit): a story's card on its feature branch (STORY-12), a feature's on main (STORY-14). How far ahead of GitHub that
 * leaves it (null when git couldn't count), else why not; nothing changes then. `clean` leaves a checkout of `into` with
 * local changes alone.
 */
export async function cardOnBranch(
  git: MergeGit,
  top: string,
  remote: string,
  into: string,
  card: { path: string; text: string; id: string },
  clean = false,
): Promise<string | { ahead: number | null }> {
  const remoteTip = await git.fetchTip(top, remote, into);
  const local = await git.commitOf(top, `refs/heads/${into}`);
  if (!remoteTip || !local) return SETTLE_NOTES.feature(into);
  const parents = (await git.isAncestor(top, local, remoteTip))
    ? [remoteTip]
    : (await git.isAncestor(top, remoteTip, local))
      ? [local]
      : [local, remoteTip];
  const message = cardMessage(card.id, into);
  const made = await git.mergeCommit(top, { parents, path: card.path, text: card.text, message });
  if ("conflicts" in made || !(await git.publish(top, into, made.commit, local, clean))) {
    return SETTLE_NOTES.feature(into);
  }
  const ahead = await git.git(top, ["rev-list", "--count", `${remoteTip}..${made.commit}`]);
  const commits = Number(ahead.stdout.trim());
  return { ahead: ahead.code === 0 && commits > 0 ? commits : null };
}

export function createMergeSettle({ scan: scanDir, now, lane, chats, git, write = writeAtomic }: MergeSettleDeps) {
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
      const top = scan.collected.paths.top;
      const remains: string[] = [];
      if (remote) {
        // The card is written only once the feature branch has it: until then the story reads as not merged yet.
        const made = await cardOnBranch(git, top, remote.name, into, { path, text, id });
        if (typeof made === "string") return { remains: [made] };
        if (made.ahead !== null) remains.push(SETTLE_NOTES.ahead(into, made.ahead));
      }
      await write(fileIn(found.root, path), text);
      const removed = await git.removeStory(top, found.root, path, owner.branch, into);
      remains.push(...removed.remains);
      if (removed.removed && remote) {
        const note = await git.deleteRemote(top, remote.name, owner.branch, git.mergedInto(top, owner.branch, into));
        if (note !== null) remains.push(note);
      } else if (removed.removed) {
        remains.push(...(await git.deleteFromRemotes(top, owner.branch, into)));
      }
      await scanDir(dir);
      return { remains };
    });
  }

  return { settle };
}

export type MergeSettle = ReturnType<typeof createMergeSettle>;
