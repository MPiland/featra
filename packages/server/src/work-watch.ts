/**
 * Keeps each watched project's Work list current (ADR 0016). File-system watches on every working tree's `.featra`
 * and on git's refs and worktree list trigger a rescan, debounced and one at a time; listeners hear only lists that
 * changed. A rescan reuses what git said last time unless a git target fired, so a card edit runs no git. Watches are
 * shared per folder and end when the last listener stops. A scan that fails, or reads a card a writer has just emptied,
 * is tried once more when that settles; one that fails again keeps the last good list, with the problem (BUG-24, BUG-25).
 */
import { watch } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";
import { copyKey, EMPTY_WORK_LIST, errorMessage, type WorkList } from "@featra/work-format";
import type { Scan, Scanner } from "./work-scan.ts";
import { targetsOf, watchTargets, type WatchFolder, type WatchSet } from "./work-watch-targets.ts";

export type WorkListener = (list: WorkList) => void;

/** What one listener takes from a scan: the Work list, or one card's view (ADR 0017). */
export type ScanPick<T> = (scan: Scan | null, list: WorkList) => T;

export interface WorkWatches {
  /** Starts or joins the watch on `dir`: answers with the list now, then calls `listener` with each change. */
  watch: (dir: string, listener: WorkListener) => Promise<{ list: WorkList; stop: () => void }>;
  /** Like `watch`, for what `pick` takes from each scan: answers with it now, then each time its JSON changes. */
  observe: <T>(dir: string, pick: ScanPick<T>, listener: (value: T) => void) => Promise<{ value: T; stop: () => void }>;
  /** Scans `dir` now: through its watch when watched, so every listener hears it (BUG-6); else a full scan. */
  scan: (dir: string) => Promise<Scan | null>;
  /** The last good scan of a watched `dir`, after any in flight, scanning nothing (STORY-72); else a full scan. */
  shown: (dir: string) => Promise<Scan | null>;
  /**
   * Something a pick reads besides the scan changed (STORY-69): every listener of `dir` hears its last scan again, with
   * no new scan, after any scan in flight. Nothing for a folder nobody watches.
   */
  repush: (dir: string) => void;
  close: () => void;
}

/** How long a burst of file events settles before the rescan. */
export const SETTLE_MS = 50;

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

interface Entry extends WatchSet {
  dir: string;
  listeners: Set<ScanListener>;
  queue: Promise<Outcome>;
  /** The scan queued and not started yet: a new ask joins it rather than queue another (BUG-44). */
  pending: Promise<Outcome> | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  closed: boolean;
  /** The last scan, whose git state the next rescan reuses unless `gitChanged`. */
  last: Scan | null;
}

export type { WatchFolder };

export function createWorkWatches(
  scanner: Scanner,
  log: (message: string) => void,
  watchFolder: WatchFolder = watch,
): WorkWatches {
  const entries = new Map<string, Entry>();

  const { rewatch, watchGit } = watchTargets<Entry>(watchFolder, (e) => trigger(e));

  /** One scan. One that fails keeps the last good scan and list, with the problem added (BUG-25). */
  const attempt = async (e: Entry): Promise<Outcome> => {
    // Taken before the scan: a git event while it runs marks the next one.
    const reuse = e.gitChanged ? undefined : e.last?.collected.git;
    e.gitChanged = false;
    try {
      const scan = await scanner.scan(e.dir, reuse, (paths) => {
        if (!e.closed) watchGit(e, paths.common, reuse !== undefined);
      });
      e.last = scan;
      return { scan, list: scan?.list ?? EMPTY_WORK_LIST, failed: false };
    } catch (err) {
      e.gitChanged = true;
      log(`work scan failed: ${errorMessage(err)}`);
      const kept = e.last?.list ?? EMPTY_WORK_LIST;
      // Git's stderr can run to several lines; the first says what failed.
      const why = errorMessage(err).split(/\r?\n/)[0];
      const list = { ...kept, problems: [...kept.problems, `Can't read the cards: ${why}`] };
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

  /**
   * A scan that starts after this call: the one queued and not started yet, else a new one. Asks that come while a
   * scan runs share the next one, so they don't queue a scan each, each running git (BUG-44).
   */
  const run = (e: Entry): Promise<Outcome> => {
    if (e.pending) return e.pending;
    const go = () => {
      e.pending = null;
      return scanOnce(e);
    };
    const next: Promise<Outcome> = e.queue.then(go, go);
    e.pending = next;
    e.queue = next;
    return next;
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
        pending: null,
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
    shown(dir) {
      const e = entries.get(dir);
      return e ? e.queue.then(() => e.last) : scanner.scan(dir);
    },
    repush(dir) {
      const e = entries.get(dir);
      if (!e) return;
      const hear = (out: Outcome) => {
        if (!e.closed) for (const listener of e.listeners) listener(out.scan, out.list);
        return out;
      };
      e.queue = e.queue.then(hear);
    },
    close() {
      for (const e of entries.values()) end(e);
    },
  };
}
