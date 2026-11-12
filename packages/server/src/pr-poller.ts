/**
 * Reads each project's open PRs again (STORY-11): every N minutes (the project's setting) and soon after the window
 * regains focus. One read per project at a time: a request while one runs makes one more afterwards, never two at
 * once. The reads use `gh` only, so they cost no tokens.
 */
import type { Timers } from "./inbox.ts";

export interface PrPollerDeps {
  timers: Timers;
  /** Reads `dir`'s open PRs once. */
  refresh: (dir: string) => Promise<void>;
  /** The project's interval, in minutes, read each time the next read is scheduled. */
  minutes: (dir: string) => number;
  log: (message: string) => void;
  /** How long focus changes settle before the read; a second focus within it doesn't read twice. */
  focusMs?: number;
}

const MINUTE_MS = 60_000;
export const FOCUS_SETTLE_MS = 1_000;

interface Project {
  timer: unknown;
  running: boolean;
  again: boolean;
  stopped: boolean;
  done: Promise<void>;
}

export function createPrPoller({ timers, refresh, minutes, log, focusMs = FOCUS_SETTLE_MS }: PrPollerDeps) {
  const projects = new Map<string, Project>();
  let focusTimer: unknown = null;
  let closed = false;

  const unschedule = (p: Project) => {
    if (p.timer !== null) timers.clear(p.timer);
    p.timer = null;
  };
  const schedule = (dir: string, p: Project) => {
    unschedule(p);
    if (p.stopped) return;
    p.timer = timers.set(
      () => {
        p.timer = null;
        void tick(dir);
      },
      minutes(dir) * MINUTE_MS,
    );
  };

  function tick(dir: string): Promise<void> {
    const p = projects.get(dir);
    if (!p || p.stopped) return Promise.resolve();
    if (p.running) {
      p.again = true;
      return p.done;
    }
    unschedule(p);
    p.running = true;
    p.done = (async () => {
      do {
        p.again = false;
        try {
          await refresh(dir);
        } catch (err) {
          log(`PRs of ${dir} couldn't be read: ${err instanceof Error ? err.message : String(err)}`);
        }
      } while (p.again && !p.stopped);
      p.running = false;
      schedule(dir, p);
    })();
    return p.done;
  }

  return {
    /** Starts reading `dir`'s PRs: once now, then on the interval. Returns how to stop. */
    start(dir: string): () => void {
      if (closed) return () => {};
      const p: Project = { timer: null, running: false, again: false, stopped: false, done: Promise.resolve() };
      projects.set(dir, p);
      void tick(dir);
      return () => {
        p.stopped = true;
        unschedule(p);
        if (projects.get(dir) === p) projects.delete(dir);
      };
    },

    /** The interval changed: the wait in progress starts again with the new one. */
    reschedule(dir: string) {
      const p = projects.get(dir);
      if (p && !p.running) schedule(dir, p);
    },

    /** The window regained focus: every project reads its PRs once things settle. */
    focus() {
      if (focusTimer !== null) timers.clear(focusTimer);
      focusTimer = timers.set(() => {
        focusTimer = null;
        for (const dir of projects.keys()) void tick(dir);
      }, focusMs);
    },

    /** Reads `dir`'s PRs now (or once more after the read in progress). */
    now: tick,

    /** Waits for the reads in flight. */
    async idle() {
      while ([...projects.values()].some((p) => p.running)) {
        await Promise.all([...projects.values()].map((p) => p.done));
      }
    },

    close() {
      closed = true;
      if (focusTimer !== null) timers.clear(focusTimer);
      focusTimer = null;
      for (const p of projects.values()) {
        p.stopped = true;
        unschedule(p);
      }
      projects.clear();
    },
  };
}

export type PrPoller = ReturnType<typeof createPrPoller>;
