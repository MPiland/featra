/**
 * The feature burn-up as its progress pane draws it (STORY-16, ADR 0039): the series `burnUp` builds from the cards'
 * history, from the scope baseline, read at the end of each of the user's local days, and a last point for now that is
 * the feature row's own count. Pure; the caller passes the clock. Nothing here forecasts (ADR 0005).
 */
import type { Count } from "./work-list-types.ts";

/** What a burn-up counts, as the project's progress setting says. */
export type BurnUpUnit = "stories" | "tasks";

/** One step of the series: scope and done from this moment, as `burnUp` emits it. */
export interface BurnUpPoint {
  at: string;
  scope: number;
  done: number;
}

/** A started feature's burn-up as its row carries it: the scope baseline, and the steps from it. */
export interface BurnUp {
  /** The scope baseline: when the feature went in progress (ADR 0038). */
  since: string;
  /** What it counts: stories (bugs with them) or tasks, as the feature row's count does. */
  unit: BurnUpUnit;
  points: BurnUpPoint[];
}

/** A point of the chart, with what it stands for: the start, the end of a day, or now. */
export interface BurnUpDay extends BurnUpPoint {
  kind: "start" | "day" | "now";
  /** "Started Nov 11", "Nov 12" (that day's end) or "Now". */
  label: string;
}

const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");

/** A moment's day in the user's time zone, as it is now (so made each time): "Nov 11". */
export const dayLabel = (at: string | number | Date): string =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(at));

/** The local midnight that starts the day after `t`. */
function nextMidnight(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** Scope and done as the series has them at `t`: the last step at or before it (strictly before, with `before`). */
function valueAt(points: readonly BurnUpPoint[], t: number, before = false): { scope: number; done: number } {
  let value = { scope: 0, done: 0 };
  for (const p of points) {
    const at = Date.parse(p.at);
    if (before ? at >= t : at > t) break;
    value = { scope: p.scope, done: p.done };
  }
  return value;
}

/**
 * The chart's points: the baseline, then the end of each local day from the baseline's day to the one before now's,
 * then now. A feature started mid-day has that partial day as its first. A day's point is the series just before the
 * midnight that ends it. The last point is `current`, the feature row's count, so the chart ends where the row is,
 * ticks included; it is never earlier than the baseline.
 */
export function burnUpDays(chart: BurnUp, current: Count, now: Date): BurnUpDay[] {
  const start = Date.parse(chart.since);
  const end = Math.max(now.getTime(), start);
  const days: BurnUpDay[] = [
    { at: iso(start), ...valueAt(chart.points, start), kind: "start", label: `Started ${dayLabel(start)}` },
  ];
  for (let m = nextMidnight(start); m < end; m = nextMidnight(m)) {
    days.push({ at: iso(m), ...valueAt(chart.points, m, true), kind: "day", label: dayLabel(m - 1) });
  }
  days.push({ at: iso(end), scope: current.total, done: current.done, kind: "now", label: "Now" });
  return days;
}

/** A number with its unit: "1 story", "6 tasks". */
export function withUnit(n: number, unit: BurnUpUnit): string {
  const [one, many] = unit === "tasks" ? ["task", "tasks"] : ["story", "stories"];
  return `${n} ${n === 1 ? one : many}`;
}

/** The chart's text alternative: "Scope 7 stories · Done 3 stories, since Nov 11". */
export const burnUpText = (current: Count, chart: Pick<BurnUp, "since" | "unit">): string =>
  `Scope ${withUnit(current.total, chart.unit)} · Done ${withUnit(current.done, chart.unit)}, since ${dayLabel(chart.since)}`;
