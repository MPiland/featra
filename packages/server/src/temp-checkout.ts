/**
 * A temporary detached checkout of a commit, apart from the user's checkouts: where a feature's checks run (ADR 0037)
 * and where a feature nobody has checked out is served in the Browser pane (STORY-74, ADR 0047). Each lives in the
 * OS's temp folder under a prefix of its own, so ones a quit left behind are known by name and removed.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { MergeGit } from "./merge-git.ts";

/** A checkout: the repository it belongs to, and its folder. */
export interface TempCheckout {
  top: string;
  folder: string;
}

/** A detached worktree of `top` at `tip`, in a new folder named `prefix…`; why not when git refused. */
export async function checkoutAt(
  git: MergeGit,
  top: string,
  tip: string,
  prefix: string,
): Promise<{ ok: true; checkout: TempCheckout } | { ok: false; error: string }> {
  // Worktrees whose folder is gone (removed by hand, or by the OS) are forgotten first.
  await git.git(top, ["worktree", "prune"]);
  const folder = await mkdtemp(join(tmpdir(), prefix));
  const added = await git.git(top, ["worktree", "add", "--detach", "--quiet", folder, tip]);
  if (added.code === 0) return { ok: true, checkout: { top, folder } };
  await rm(folder, { recursive: true, force: true }).catch(() => {});
  return { ok: false, error: added.stderr.trim() };
}

/** Removes a checkout: git's worktree, then whatever is left of its folder. */
export async function removeCheckout(git: MergeGit, checkout: TempCheckout | null): Promise<void> {
  if (!checkout) return;
  await git.removeFolder(checkout.top, checkout.folder);
  await rm(checkout.folder, { recursive: true, force: true }).catch(() => {});
}

/** The folders of `dir`'s repository's worktrees named `prefix…`, as `git worktree list` gives them. */
export async function checkoutsNamed(git: MergeGit, dir: string, prefix: string): Promise<string[]> {
  const listed = await git.git(dir, ["worktree", "list", "--porcelain"]);
  if (listed.code !== 0) return [];
  return listed.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .filter((folder) => basename(folder).startsWith(prefix));
}
