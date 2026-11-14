import { stageCategory } from "./config.ts";
import { createdMs, existsAt, parentAt, statusAt } from "./history.ts";
import {
  CANCELLED,
  type Card,
  type CardType,
  type ContainerStatus,
  type Origin,
  type ProgressMode,
  type ProjectConfig,
} from "./types.ts";

// Rollups are always computed from cards, never stored (ADR 0003).

const isItem = (c: Card) => c.type === "story" || c.type === "bug";
const ms = (iso: string) => Date.parse(iso);
const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");

function isDone(status: string | null, config: ProjectConfig): boolean {
  return status !== null && stageCategory(status, config) === "done";
}

/** stories and bugs currently under a feature, excluding Cancelled ones. */
export function itemsOf(featureId: string, cards: readonly Card[]): Card[] {
  return cards.filter((c) => isItem(c) && c.parent === featureId && c.status !== CANCELLED);
}

export interface Progress {
  done: number;
  total: number;
  unit: ProgressMode;
  /** e.g. "6 of 10 stories done". Counts only: never a percentage of effort. */
  label: string;
}

export function progressLabel(done: number, total: number, unit: ProgressMode | "features"): string {
  const [one, many] =
    unit === "stories" ? ["story", "stories"] : unit === "tasks" ? ["task", "tasks"] : ["feature", "features"];
  return `${done} of ${total} ${total === 1 ? one : many} done`;
}

/**
 * Feature progress as counts. In `tasks` mode a done story counts all its tasks as done,
 * so a story that finished without ticking boxes doesn't drag the count.
 */
export function featureProgress(featureId: string, cards: readonly Card[], config: ProjectConfig): Progress {
  const items = itemsOf(featureId, cards);
  let done = 0;
  let total = 0;
  for (const item of items) {
    const itemDone = isDone(item.status, config);
    if (config.progress === "stories") {
      total += 1;
      if (itemDone) done += 1;
    } else {
      total += item.tasks.length;
      done += itemDone ? item.tasks.length : item.tasks.filter((t) => t.done).length;
    }
  }
  return { done, total, unit: config.progress, label: progressLabel(done, total, config.progress) };
}

export function epicProgress(epicId: string, cards: readonly Card[]): { done: number; total: number; label: string } {
  const features = cards.filter((c) => c.type === "feature" && c.parent === epicId && c.status !== "cancelled");
  const done = features.filter((f) => f.status === "done").length;
  return { done, total: features.length, label: progressLabel(done, features.length, "features") };
}

/** Cards that were ever under this feature, according to their current parent or their history. */
function everUnder(featureId: string, cards: readonly Card[]): Card[] {
  return cards.filter(
    (c) =>
      isItem(c) &&
      (c.parent === featureId ||
        c.history.some((e) => e.field === "parent" && (e.to === featureId || e.from === featureId))),
  );
}

function memberAt(card: Card, featureId: string, t: number): boolean {
  return existsAt(card, t) && parentAt(card, t) === featureId && statusAt(card, t) !== CANCELLED;
}

/** Feature statuses past the start: the first move into one of them is the scope baseline. */
const STARTED: ReadonlySet<string | null> = new Set<ContainerStatus>(["active", "done"]);

/**
 * The scope baseline (ADR 0038): the moment the feature went in progress, read from its own history (Start writes that
 * status event, ADR 0024). Null before then. The first such event wins, so the baseline never moves. A feature in
 * progress whose history never records the move (a card written by hand already active) went in progress when it was
 * created. A `baseline` an approval stored before ADR 0038 is ignored.
 */
export function scopeBaseline(featureId: string, cards: readonly Card[]): string | null {
  const feature = cards.find((c) => c.id === featureId && c.type === "feature");
  if (!feature) return null;
  const moved = feature.history.find((e) => e.field === "status" && STARTED.has(e.to));
  if (moved) return moved.at;
  return STARTED.has(feature.status) ? feature.created || null : null;
}

/** The latest moment the card joined this feature (created under it, or moved under it), in milliseconds. */
function joinedMs(card: Card, featureId: string): number | null {
  let joined: number | null = null;
  const parentEvents = card.history.filter((e) => e.field === "parent");
  const initialParent = parentEvents[0] ? parentEvents[0].from : card.parent;
  if (initialParent === featureId) joined = createdMs(card);
  for (const e of parentEvents) if (e.to === featureId) joined = ms(e.at);
  return joined !== null && Number.isFinite(joined) ? joined : null;
}

/** The latest moment the card joined this feature (created under it, or moved under it). */
export function joinedAt(card: Card, featureId: string): string | null {
  const joined = joinedMs(card, featureId);
  return joined === null ? null : iso(joined);
}

export interface AddedItem {
  id: string;
  title: string;
  type: CardType;
  origin: Origin;
  at: string;
}

/** Added items counted apart: stories (made or moved in after the baseline) and bugs. */
export interface AddedCounts {
  stories: number;
  bugs: number;
}

export interface ScopeSummary {
  /** When the feature went in progress; null before. */
  baseline: string | null;
  /** Items (not Cancelled) that joined after the baseline, with their origin. */
  added: AddedItem[];
  /** e.g. "+3 added since start"; empty when nothing was added. */
  addedLabel: string;
  addedCounts: AddedCounts;
  /** e.g. "+3 added: 2 stories · 1 bug"; empty when nothing was added. */
  addedBreakdown: string;
  bugs: { total: number; open: number };
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "+3 added: 2 stories · 1 bug", leaving out a kind with none; empty when nothing was added. */
export function addedBreakdown({ stories, bugs }: AddedCounts): string {
  const parts = [];
  if (stories) parts.push(counted(stories, "story", "stories"));
  if (bugs) parts.push(counted(bugs, "bug", "bugs"));
  return parts.length ? `+${stories + bugs} added: ${parts.join(" · ")}` : "";
}

export function scopeSummary(featureId: string, cards: readonly Card[], config: ProjectConfig): ScopeSummary {
  const baseline = scopeBaseline(featureId, cards);
  const items = itemsOf(featureId, cards);
  const added: AddedItem[] = [];
  // Added scope is what joined after the baseline. An item that joined in the same instant counts as planned.
  if (baseline !== null) {
    for (const c of items) {
      const joined = joinedMs(c, featureId);
      if (joined === null || joined <= ms(baseline)) continue;
      added.push({ id: c.id, title: c.title, type: c.type, origin: c.origin, at: iso(joined) });
    }
  }
  const addedCounts = {
    stories: added.filter((a) => a.type !== "bug").length,
    bugs: added.filter((a) => a.type === "bug").length,
  };
  const bugs = items.filter((c) => c.type === "bug");
  return {
    baseline,
    added,
    addedLabel: added.length ? `+${added.length} added since start` : "",
    addedCounts,
    addedBreakdown: addedBreakdown(addedCounts),
    bugs: { total: bugs.length, open: bugs.filter((b) => !isDone(b.status, config)).length },
  };
}

/** Origin for a new item under a feature: bugs are `bug`; anything after the baseline is `added`. */
export function originForNewItem(featureId: string | null, type: "story" | "bug", cards: readonly Card[]): Origin {
  if (type === "bug") return "bug";
  if (featureId === null) return "planned";
  return scopeBaseline(featureId, cards) === null ? "planned" : "added";
}

export interface BurnUpPoint {
  at: string;
  scope: number;
  done: number;
}

/**
 * Burn-up series for a feature, built only from cards' `history[]` (never commit times),
 * so uncommitted changes are included. Counts items (stories and bugs). No forecast (ADR 0005).
 * It starts at the scope baseline (ADR 0038), so its scope line and "+N added" agree, and is empty before the feature
 * goes in progress. A point is emitted whenever scope or done changes.
 */
export function burnUp(featureId: string, cards: readonly Card[], config: ProjectConfig): BurnUpPoint[] {
  const baseline = scopeBaseline(featureId, cards);
  const relevant = everUnder(featureId, cards);
  if (baseline === null || !relevant.length) return [];
  const start = ms(baseline);
  const times = new Set<number>([start]);
  for (const c of relevant) {
    const created = createdMs(c);
    if (Number.isFinite(created)) times.add(created);
    for (const e of c.history) if (e.field === "status" || e.field === "parent") times.add(ms(e.at));
  }
  const points: BurnUpPoint[] = [];
  for (const t of [...times].filter((x) => x >= start).toSorted((a, b) => a - b)) {
    let scope = 0;
    let done = 0;
    for (const c of relevant) {
      if (!memberAt(c, featureId, t)) continue;
      scope += 1;
      if (isDone(statusAt(c, t), config)) done += 1;
    }
    const last = points.at(-1);
    if (!last || last.scope !== scope || last.done !== done) points.push({ at: iso(t), scope, done });
  }
  return points;
}
