/**
 * The git an abandoned story needs (STORY-58), over the merge's (merge-git.ts): what would be lost (commits no remote
 * and no feature branch has), which remotes have the story's branch, and taking the branch away. Every deletion is at
 * the commit the warning was made from (a lease), so work that lands meanwhile is never deleted. Nothing here rebases
 * or runs `git commit`.
 */
import { REMOVE_NOTES, type MergeGit } from "./merge-git.ts";

/** A remote's copy of the story's branch, at the commit it was read at. */
export interface RemoteCopy {
  remote: string;
  tip: string;
}

/** Which remotes' copies of a branch go with it, and what stays, as the user is told it. */
export interface RemoteCopies {
  /** Copies whose every commit is in the local branch, so deleting them loses nothing the warning didn't name. */
  deletable: RemoteCopy[];
  /** Copies that stay, said. */
  kept: string[];
}

export const ABANDON_NOTES = {
  ahead: (branch: string) => `The remote branch ${branch} has commits that aren't here, so it's still there.`,
} as const;

export function createAbandonGit(git: MergeGit) {
  /**
   * The commits on the story's branch at `tip` that go with it, newest first, as `<short commit> <subject>`, with the
   * full commits in `shas`: those in no `feature` branch and on no remote-tracking branch but the story's own, which is
   * deleted with it (review fix).
   */
  async function unpushed(top: string, tip: string, branch: string, feature: string | null) {
    const not = ["--not", `--exclude=*/${branch}`, "--remotes", ...(feature ? [`refs/heads/${feature}`] : [])];
    const out = (await git.must(top, ["log", "--format=%H %h %s", tip, ...not, "--"])).stdout;
    const lines = out.split(/\r?\n/).filter(Boolean);
    return {
      shas: lines.map((l) => l.split(" ")[0] ?? ""),
      commits: lines.map((l) => l.slice(l.indexOf(" ") + 1)),
    };
  }

  /**
   * The remotes that have `branch`: a copy whose commits are all in `tip` goes with the branch; one with commits that
   * aren't here, or that can't be reached but was fetched before, stays and is said.
   */
  async function remoteCopies(top: string, branch: string, tip: string | null): Promise<RemoteCopies> {
    const deletable: RemoteCopy[] = [];
    const kept = new Set<string>();
    const remotes = (await git.git(top, ["remote"])).stdout.split(/\r?\n/).filter(Boolean);
    for (const remote of remotes) {
      const there = await git.remoteTip(top, remote, branch);
      if (there === undefined) {
        if (await git.commitOf(top, `refs/remotes/${remote}/${branch}`)) kept.add(REMOVE_NOTES.remote(branch));
        continue;
      }
      if (there === null) continue;
      if (tip !== null && (there === tip || (await git.isAncestor(top, there, tip)))) {
        deletable.push({ remote, tip: there });
      } else {
        kept.add(ABANDON_NOTES.ahead(branch));
      }
    }
    return { deletable, kept: [...kept] };
  }

  /** Deletes the local `branch` while it is still at `tip`; a note when it stays. */
  async function deleteBranch(top: string, branch: string, tip: string): Promise<string | null> {
    const r = await git.git(top, ["update-ref", "-d", `refs/heads/${branch}`, tip]);
    return r.code === 0 ? null : REMOVE_NOTES.branch(branch);
  }

  /**
   * Deletes `branch` on each remote of `copies` through the merge's `deleteRemote`, only while it is still at the commit
   * the warning read there; a note for each that stays.
   */
  async function deleteCopies(top: string, branch: string, copies: readonly RemoteCopy[]): Promise<string[]> {
    const remains = new Set<string>();
    for (const { remote, tip } of copies) {
      const same = async (now: string) => (now === tip ? null : ABANDON_NOTES.ahead(branch));
      const note = await git.deleteRemote(top, remote, branch, same);
      if (note !== null) remains.add(note);
    }
    return [...remains];
  }

  return { unpushed, remoteCopies, deleteBranch, deleteCopies };
}

export type AbandonGit = ReturnType<typeof createAbandonGit>;
