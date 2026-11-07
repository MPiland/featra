/**
 * Keeps each watched project's Work list current (ADR 0016). File-system watches on every working tree's `.featra`
 * and on git's refs and worktree list trigger a rescan, debounced and one at a time; listeners hear only lists that
 * changed. Watches are shared per folder and end when the last listener stops.
 */
import { watch, type FSWatcher } from "node:fs";
import { basename, join } from "node:path";
import { EMPTY_WORK_LIST, errorMessage, FEATRA_DIR, type WorkList } from "@featra/work-format";
import type { Scan, Scanner } from "./work-scan.ts";

export type WorkListener = (list: WorkList) => void;

export interface WorkWatches {
  /** Starts or joins the watch on `dir`: answers with the list now, then calls `listener` with each change. */
  watch: (dir: string, listener: WorkListener) => Promise<{ list: WorkList; stop: () => void }>;
  /** Rescans `dir` now, as after the server wrote to it. */
  refresh: (dir: string) => Promise<void>;
  close: () => void;
}

/** How long a burst of file events settles before the rescan. */
export const SETTLE_MS = 50;

interface Target {
  path: string;
  recursive: boolean;
  /** Only events for these file names count. */
  names?: readonly string[];
}

interface Entry {
  dir: string;
  listeners: Set<WorkListener>;
  watchers: Map<string, FSWatcher>;
  last: string;
  queue: Promise<WorkList>;
  timer: ReturnType<typeof setTimeout> | undefined;
  closed: boolean;
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
    { path: common, recursive: false, names: ["HEAD", "packed-refs"] },
    { path: join(common, "refs", "heads"), recursive: true },
    { path: join(common, "worktrees"), recursive: true, names: ["HEAD", "gitdir"] },
  );
  return targets;
}

export function createWorkWatches(scanner: Scanner, log: (message: string) => void): WorkWatches {
  const entries = new Map<string, Entry>();

  const rewatch = (e: Entry, targets: Target[]) => {
    const wanted = new Map(targets.map((t) => [`${t.recursive ? "r" : "f"}|${t.path}`, t]));
    for (const [key, w] of e.watchers) {
      if (wanted.has(key)) continue;
      w.close();
      e.watchers.delete(key);
    }
    for (const [key, t] of wanted) {
      if (e.watchers.has(key)) continue;
      try {
        const w = watch(t.path, { recursive: t.recursive, persistent: false }, (_type, name) => {
          if (t.names && !(name && t.names.includes(basename(name)))) return;
          trigger(e);
        });
        w.on("error", () => {
          w.close();
          e.watchers.delete(key);
          trigger(e);
        });
        e.watchers.set(key, w);
      } catch {
        // Not there (yet): the next scan tries again.
      }
    }
  };

  const scanOnce = async (e: Entry): Promise<WorkList> => {
    let list: WorkList;
    let scan: Scan | null = null;
    try {
      scan = await scanner.scan(e.dir);
      list = scan?.list ?? EMPTY_WORK_LIST;
    } catch (err) {
      log(`work scan failed: ${errorMessage(err)}`);
      list = { ...EMPTY_WORK_LIST, problems: [`Can't read the cards: ${errorMessage(err)}`] };
    }
    if (e.closed) return list;
    rewatch(e, targetsOf(e.dir, scan));
    const json = JSON.stringify(list);
    if (json !== e.last) {
      e.last = json;
      for (const listener of e.listeners) listener(list);
    }
    return list;
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

  return {
    async watch(dir, listener) {
      let e = entries.get(dir);
      if (!e) {
        e = {
          dir,
          listeners: new Set(),
          watchers: new Map(),
          last: "",
          queue: Promise.resolve(EMPTY_WORK_LIST),
          timer: undefined,
          closed: false,
        };
        entries.set(dir, e);
      }
      const entry = e;
      const list = await run(entry);
      const own: WorkListener = (l) => listener(l);
      entry.listeners.add(own);
      return {
        list,
        stop: () => {
          entry.listeners.delete(own);
          if (!entry.listeners.size && !entry.closed) end(entry);
        },
      };
    },
    async refresh(dir) {
      const e = entries.get(dir);
      if (e) await run(e);
    },
    close() {
      for (const e of entries.values()) end(e);
    },
  };
}
