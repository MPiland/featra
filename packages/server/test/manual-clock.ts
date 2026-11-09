/** The server's clock and timers moved by hand, so a test about a wait never sleeps. */
import type { Timers } from "../src/inbox.ts";

export const START = Date.parse("2026-11-09T10:00:00.000Z");
export const MINUTE = 60_000;

export function manualClock(start = START) {
  let time = start;
  let nextId = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  const timers: Timers = {
    set(run, ms) {
      const id = nextId++;
      pending.set(id, { at: time + ms, run });
      return id;
    },
    clear: (timer) => void pending.delete(timer as number),
  };
  return {
    now: () => new Date(time),
    timers,
    /** Moves the clock on by `ms`, running each timer that falls due on the way at its own moment. */
    advance(ms: number) {
      const target = time + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= target).toSorted((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        time = Math.max(time, due[1].at);
        due[1].run();
      }
      time = target;
    },
    /** How many timers are set. */
    timersSet: () => pending.size,
  };
}
