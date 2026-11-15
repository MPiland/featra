/**
 * Keeps each watched project's Work list current (ADR 0016). File-system watches on every working tree's `.featra`
 * and on git's refs and worktree list trigger a rescan, debounced and one at a time; listeners hear only lists that
 * changed. A rescan reuses what git said last time unless a git target fired, so a card edit runs no git. Watches are
 * shared per folder and end when the last listener stops. A scan that fails, or reads a card a writer has just emptied,
 * is tried once more when that settles; one that fails again keeps the last good list, with the problem (BUG-24, BUG-25).
 */
import { watch, type FSWatcher } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { copyKey, EMPTY_WORK_LIST, errorMessage, FEATRA_DIR, type WorkList } from "@featra/work-format";
import type { Scan, Scanner } from "./work-scan.ts";

export type WorkListener = (list: WorkList) => void;

/** What one listener takes from a scan: the Work list, or one card's view (ADR 0017). */
export type ScanPick<T> = (scan: Scan | null, list: WorkList) => T;

export interface WorkWatches {
  /** Starts or joins the watch on `dir`: answers with the list now, then calls `listener` with each change. */
  watch: (dir: string, listener: WorkListener) => Promise<{ list: WorkList; stop: () => void }>;
  /**
   * Like `watch`, for what `pick` takes from each scan: answers with it now, then calls `listener` each time its
   * JSON changes.
   */
  observe: <T>(dir: string, pick: ScanPick<T>, listener: (value: T) => void) => Promise<{ value: T; stop: () => void }>;
  /**
   * Scans `dir` now. A watched folder scans through its watch, so the scan reaches every listener and reuses git's
   * answers unless a git target fired (BUG-6); any other folder gets a full scan.
   */
  scan: (dir: string) => Promise<Scan | null>;
  close: () => void;
}

/** How long a burst of file events settles before the rescan. */
export const SETTLE_MS = 50;

interface Target {
  path: string;
  recursive: boolean;
  /** Only events for these file names count. */
  names?: readonly string[];
  /** Events for the folder's own entries count too: a worktree's folder added or removed (BUG-6). */
  children?: boolean;
  /** An event here means git's state changed, so the rescan asks git again. */
  git?: boolean;
}

/** Hears every scan; it decides itself whether anything it cares about changed. */
type ScanListener = (scan: Scan | null, list: WorkList) => void;

/** What one scan of a watch gave: on a failure, the last good scan and its list with the problem. */
interface Outcome {
  scan: Scan | null;
  list: WorkList;
  failed: boolean;
}

/** The working-tree cards `scan` couldn't read or parse, each with what it read. */
const unreadable = (scan: Scan | null) =>
  new Set(
    scan?.collected.copies
      .filter((c) => c.workingTree && !c.card)
      .map((c) => `${copyKey(c.location, c.path)}\0${c.text}`),
  );

/**
 * Whether `scan` read a working-tree card it couldn't read or parse that `before` read fine, as when a writer has
 * emptied it to write the new text (BUG-24). A card broken the same way as before is settled: it is a problem.
 */
const unsettled = (scan: Scan | null, before: Scan | null) => {
  const was = unreadable(before);
  return [...unreadable(scan)].some((c) => !was.has(c));
};

interface Entry {
  dir: string;
  listeners: Set<ScanListener>;
  watchers: Map<string, FSWatcher>;
  queue: Promise<Outcome>;
  timer: ReturnType<typeof setTimeout> | undefined;
  closed: boolean;
  /** The last scan, whose git state the next rescan reuses unless `gitChanged`. */
  last: Scan | null;
  gitChanged: boolean;
}

/** Whether an event for `name` (relative to the target, or absolute for the target itself) counts. */
function counts(t: Target, name: string | null): boolean {
  // Node doesn't promise a name, and an event without one can't be ruled out (BUG-6).
  if (!t.names || !name) return true;
  if (t.names.includes(basename(name))) return true;
  return Boolean(t.children) && !/[\\/]/.test(name);
}

function targetsOf(dir: string, scan: Scan | null): Target[] {
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
  targets.push(
    // `worktrees` itself comes with the first worktree and goes with the last.
    { path: common, recursive: false, names: ["HEAD", "packed-refs", "worktrees"], git: true },
    { path: join(common, "refs", "heads"), recursive: true, git: true },
    { path: join(common, "worktrees"), recursive: true, names: ["HEAD", "gitdir"], children: true, git: true },
  );
  return targets;
}

/** `fs.watch`, or a stand-in for tests that drive a watcher's events and errors themselves. */
export type WatchFolder = typeof watch;

export function createWorkWatches(
  scanner: Scanner,
  log: (message: string) => void,
  watchFolder: WatchFolder = watch,
): WorkWatches {
  const entries = new Map<string, Entry>();

  /** Starts and ends watchers to match `targets`; whether it started any. */
  const rewatch = (e: Entry, targets: Target[]): boolean => {
    let started = false;
    const wanted = new Map(targets.map((t) => [`${t.recursive ? "r" : "f"}|${t.path}`, t]));
    for (const [key, w] of e.watchers) {
      if (wanted.has(key)) continue;
      w.close();
      e.watchers.delete(key);
    }
    for (const [key, t] of wanted) {
      if (e.watchers.has(key)) continue;
      try {
        const gone = () => {
          w.close();
          // A closed watcher's late event or error must not drop the newer watcher under its key (BUG-6).
          if (e.watchers.get(key) !== w) return;
          e.watchers.delete(key);
          e.gitChanged = true;
          trigger(e);
        };
        const w = watchFolder(t.path, { recursive: t.recursive, persistent: false }, (_type, name) => {
          // Windows names the folder itself, absolute, without end once it's deleted (BUG-6).
          if (name && isAbsolute(name)) return gone();
          if (!counts(t, name)) return;
          if (t.git) e.gitChanged = true;
          trigger(e);
        });
        w.on("error", gone);
        e.watchers.set(key, w);
        started = true;
      } catch {
        // Not there (yet): the next scan tries again.
      }
    }
    return started;
  };

  /** One scan. One that fails keeps the last good scan and list, with the problem added (BUG-25). */
  const attempt = async (e: Entry): Promise<Outcome> => {
    // Taken before the scan: a git event while it runs marks the next one.
    const reuse = e.gitChanged ? undefined : e.last?.collected.git;
    e.gitChanged = false;
    try {
      const scan = await scanner.scan(e.dir, reuse);
      e.last = scan;
      return { scan, list: scan?.list ?? EMPTY_WORK_LIST, failed: false };
    } catch (err) {
      e.gitChanged = true;
      log(`work scan failed: ${errorMessage(err)}`);
      const kept = e.last?.list ?? EMPTY_WORK_LIST;
      const list = { ...kept, problems: [...kept.problems, `Can't read the cards: ${errorMessage(err)}`] };
      return { scan: e.last, list, failed: true };
    }
  };

  const scanOnce = async (e: Entry): Promise<Outcome> => {
    // A scan queued before the watch ended would start after the scanner closed and reopen its index (BUG-6).
    if (e.closed) return { scan: e.last, list: e.last?.list ?? EMPTY_WORK_LIST, failed: false };
    const before = e.last;
    let out = await attempt(e);
    // A scan that failed, or read a card a writer outside Featra had emptied, is likely caught mid-change (a merge
    // rewriting git's config, an editor saving): it is looked at once more when that settles, before anyone hears it.
    if ((out.failed || unsettled(out.scan, before)) && !e.closed) {
      await pause(SETTLE_MS);
      if (!e.closed) out = await attempt(e);
    }
    if (e.closed) return out;
    // An edit between the scan's read and a new watcher starting was heard by nobody: look once more (BUG-12).
    if (rewatch(e, targetsOf(e.dir, e.last))) trigger(e);
    for (const listener of e.listeners) listener(out.scan, out.list);
    return out;
  };

  const run = (e: Entry) => {
    e.queue = e.queue.then(
      () => scanOnce(e),
      () => scanOnce(e),
    );
    return e.queue;
  };

  function trigger(e: Entry) {
    if (e.closed) return;
    clearTimeout(e.timer);
    e.timer = setTimeout(() => void run(e), SETTLE_MS);
  }

  const end = (e: Entry) => {
    e.closed = true;
    clearTimeout(e.timer);
    for (const w of e.watchers.values()) w.close();
    e.watchers.clear();
    entries.delete(e.dir);
  };

  const observe = async <T>(dir: string, pick: ScanPick<T>, listener: (value: T) => void) => {
    let e = entries.get(dir);
    if (!e) {
      e = {
        dir,
        listeners: new Set(),
        watchers: new Map(),
        queue: Promise.resolve({ scan: null, list: EMPTY_WORK_LIST, failed: false }),
        timer: undefined,
        closed: false,
        last: null,
        gitChanged: true,
      };
      entries.set(dir, e);
    }
    const entry = e;
    // Join before the first scan, so another listener stopping meanwhile can't end the entry under us (BUG-5).
    // Scans before our own answer are left to that answer.
    let answered = false;
    let last: string | undefined;
    const own: ScanListener = (scan, list) => {
      if (!answered) return;
      const next = pick(scan, list);
      const json = JSON.stringify(next);
      if (json === last) return;
      last = json;
      listener(next);
    };
    entry.listeners.add(own);
    const first = await run(entry);
    const value = pick(first.scan, first.list);
    last = JSON.stringify(value);
    answered = true;
    return {
      value,
      stop: () => {
        entry.listeners.delete(own);
        if (!entry.listeners.size && !entry.closed) end(entry);
      },
    };
  };

  return {
    async watch(dir, listener) {
      const { value, stop } = await observe(dir, (_scan, list) => list, listener);
      return { list: value, stop };
    },
    observe,
    async scan(dir) {
      const e = entries.get(dir);
      if (!e) return scanner.scan(dir);
      // An action needs the cards as they are now: the last good scan kept for display won't do.
      const out = await run(e);
      return out.failed ? null : out.scan;
    },
    close() {
      for (const e of entries.values()) end(e);
    },
  };
}
