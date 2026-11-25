/**
 * What a Work watch watches and how it starts and ends its file watchers (ADR 0016): each working tree's `.featra`,
 * and git's refs, HEAD and worktree list. An event on a git target means the next scan asks git again.
 */
import type { FSWatcher, watch } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { FEATRA_DIR } from "@featra/work-format";
import type { Scan } from "./work-scan.ts";

export interface Target {
  path: string;
  recursive: boolean;
  /** Only events for these file names count. */
  names?: readonly string[];
  /** Events for the folder's own entries count too: a worktree's folder added or removed (BUG-6). */
  children?: boolean;
  /** An event here means git's state changed, so the rescan asks git again. */
  git?: boolean;
}

/** `fs.watch`, or a stand-in for tests that drive a watcher's events and errors themselves. */
export type WatchFolder = typeof watch;

/** A watch's file watchers by target, and whether the next scan must ask git again. */
export interface WatchSet {
  watchers: Map<string, FSWatcher>;
  gitChanged: boolean;
}

/**
 * Whether a `type` event for `name` (relative to the target, or absolute for the target itself) counts. A child folder
 * counts when added or removed (a rename), not when only its times change: Windows reports git reading a worktree's
 * folder as a change to it (BUG-44).
 */
function counts(t: Target, type: string, name: string | null): boolean {
  // Node doesn't promise a name, and an event without one can't be ruled out (BUG-6).
  if (!t.names || !name) return true;
  if (t.names.includes(basename(name))) return true;
  return Boolean(t.children) && type === "rename" && !/[\\/]/.test(name);
}

/** Git's refs, HEAD and worktree list in the common dir `common`. */
export const gitTargets = (common: string): Target[] => [
  // `worktrees` itself comes with the first worktree and goes with the last.
  { path: common, recursive: false, names: ["HEAD", "packed-refs", "worktrees"], git: true },
  { path: join(common, "refs", "heads"), recursive: true, git: true },
  { path: join(common, "worktrees"), recursive: true, names: ["HEAD", "gitdir"], children: true, git: true },
];

/** Everything a watch on `dir` watches after `scan`. */
export function targetsOf(dir: string, scan: Scan | null): Target[] {
  // The opened folder itself, so a `.featra` made there (by init) starts the list.
  const targets: Target[] = [{ path: dir, recursive: false, names: [FEATRA_DIR] }];
  if (!scan) return targets;
  const { top, common } = scan.collected.paths;
  for (const root of new Set([top, ...scan.collected.roots.values()])) {
    targets.push(
      { path: root, recursive: false, names: [FEATRA_DIR] },
      { path: join(root, FEATRA_DIR), recursive: true },
    );
  }
  targets.push(...gitTargets(common));
  return targets;
}

const keyOf = (t: Target) => `${t.recursive ? "r" : "f"}|${t.path}`;

/** Starts and ends a watch's file watchers; `trigger` asks for a rescan. */
export function watchTargets<S extends WatchSet>(watchFolder: WatchFolder, trigger: (set: S) => void) {
  /**
   * Starts a watcher on `t` unless one runs; whether it started. `stale` when what git said may predate it, so the
   * next scan asks git again.
   */
  const start = (set: S, t: Target, stale: boolean): boolean => {
    const key = keyOf(t);
    if (set.watchers.has(key)) return false;
    try {
      const gone = () => {
        w.close();
        // A closed watcher's late event or error must not drop the newer watcher under its key (BUG-6).
        if (set.watchers.get(key) !== w) return;
        set.watchers.delete(key);
        set.gitChanged = true;
        trigger(set);
      };
      const w = watchFolder(t.path, { recursive: t.recursive, persistent: false }, (type, name) => {
        // Windows names the folder itself, absolute, without end once it's deleted (BUG-6).
        if (name && isAbsolute(name)) return gone();
        if (!counts(t, type, name)) return;
        if (t.git) set.gitChanged = true;
        trigger(set);
      });
      w.on("error", gone);
      set.watchers.set(key, w);
      if (t.git && stale) set.gitChanged = true;
      return true;
    } catch {
      // Not there (yet), or out of handles: the next scan tries again.
      return false;
    }
  };

  return {
    /** Starts and ends watchers to match `targets`; whether it started any. */
    rewatch: (set: S, targets: Target[]): boolean => {
      const wanted = new Map(targets.map((t) => [keyOf(t), t]));
      for (const [key, w] of set.watchers) {
        if (wanted.has(key)) continue;
        w.close();
        set.watchers.delete(key);
      }
      let started = false;
      // What git said before a git watcher started may be out of date already: the next scan asks again.
      for (const t of wanted.values()) if (start(set, t, true)) started = true;
      return started;
    },
    /**
     * Git's watchers in `common`, started as soon as a scan knows the repository and before it reads git, so that read
     * can't predate them (BUG-44). A scan that reuses what git said earlier reads nothing after them: one started then
     * is `stale`, and a rescan that asks git follows.
     */
    watchGit: (set: S, common: string, stale: boolean) => {
      let started = false;
      for (const t of gitTargets(common)) if (start(set, t, stale)) started = true;
      if (started && stale) trigger(set);
    },
  };
}
