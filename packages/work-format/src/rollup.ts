import { stageCategory } from "./config.ts";
import { createdMs, existsAt, parentAt, statusAt } from "./history.ts";
import { CANCELLED, type Card, type CardType, type Origin, type ProgressMode, type ProjectConfig } from "./types.ts";

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

/**
 * The scope baseline: the first moment an item of this feature left the not-started stages.
 * Null until work starts. Once set it never moves, even if that item later goes back.
 */
export function scopeBaseline(featureId: string, cards: readonly Card[], config: ProjectConfig): string | null {
  let best: number | null = null;
  for (const c of everUnder(featureId, cards)) {
    for (const e of c.history) {
      if (e.field !== "status" || e.to === null || e.to === CANCELLED) continue;
      const cat = stageCategory(e.to, config);
      if (cat !== "active" && cat !== "done") continue;
      const t = ms(e.at);
      if (parentAt(c, t) !== featureId) continue;
      if (best === null || t < best) best = t;
    }
  }
  return best === null ? null : iso(best);
}

/** The latest moment the card joined this feature (created under it, or moved under it). */
export function joinedAt(card: Card, featureId: string): string | null {
  let joined: number | null = null;
  const parentEvents = card.history.filter((e) => e.field === "parent");
  const initialParent = parentEvents[0] ? parentEvents[0].from : card.parent;
  if (initialParent === featureId) joined = createdMs(card);
  for (const e of parentEvents) if (e.to === featureId) joined = ms(e.at);
  return joined === null ? null : Number.isFinite(joined) ? iso(joined) : null;
}

export interface AddedItem {
  id: string;
  title: string;
  type: CardType;
  origin: Origin;
  at: string;
}

export interface ScopeSummary {
  /** When work started; null before any item went active. */
  baseline: string | null;
  /** Items (not Cancelled) that joined after the baseline, with their origin. */
  added: AddedItem[];
  /** e.g. "+3 added since start"; empty when nothing was added. */
  addedLabel: string;
  bugs: { total: number; open: number };
}

export function scopeSummary(featureId: string, cards: readonly Card[], config: ProjectConfig): ScopeSummary {
  const baseline = scopeBaseline(featureId, cards, config);
  const items = itemsOf(featureId, cards);
  const added: AddedItem[] = [];
  if (baseline !== null) {
    for (const c of items) {
      const at = joinedAt(c, featureId);
      if (at !== null && ms(at) > ms(baseline))
        added.push({ id: c.id, title: c.title, type: c.type, origin: c.origin, at });
    }
  }
  const bugs = items.filter((c) => c.type === "bug");
  return {
    baseline,
    added,
    addedLabel: added.length ? `+${added.length} added since start` : "",
    bugs: { total: bugs.length, open: bugs.filter((b) => !isDone(b.status, config)).length },
  };
}

/** Origin for a new item under a feature: bugs are `bug`; anything after the baseline is `added`. */
export function originForNewItem(
  featureId: string | null,
  type: "story" | "bug",
  cards: readonly Card[],
  config: ProjectConfig,
): Origin {
  if (type === "bug") return "bug";
  if (featureId === null) return "planned";
  return scopeBaseline(featureId, cards, config) === null ? "planned" : "added";
}

export interface BurnUpPoint {
  at: string;
  scope: number;
  done: number;
}

/**
 * Burn-up series for a feature, built only from cards' `history[]` (never commit times),
 * so uncommitted changes are included. Counts items (stories and bugs). No forecast (ADR 0005).
 * A point is emitted whenever scope or done changes.
 */
export function burnUp(featureId: string, cards: readonly Card[], config: ProjectConfig): BurnUpPoint[] {
  const relevant = everUnder(featureId, cards);
  const times = new Set<number>();
  for (const c of relevant) {
    const created = createdMs(c);
    if (Number.isFinite(created)) times.add(created);
    for (const e of c.history) if (e.field === "status" || e.field === "parent") times.add(ms(e.at));
  }
  const points: BurnUpPoint[] = [];
  for (const t of [...times].toSorted((a, b) => a - b)) {
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
