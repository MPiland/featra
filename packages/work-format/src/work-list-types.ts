/**
 * The Work list as the server sends it: epics, their features and the features' stories, with counts computed from
 * the owner copies (ADR 0003). Types and the client-side check only, so the client can import it without the card
 * parser.
 */
import { isOneOf, isRecord } from "./utils/guards.ts";

/** How a status reads at a glance: the colour of its dot and its slice of a bar. */
export type Tone = "done" | "review" | "active" | "idle" | "cancelled";
export const TONES: readonly Tone[] = ["done", "review", "active", "idle", "cancelled"];

/** The filter chips, besides All. A feature can match more than one. */
export type WorkFilter = "in-progress" | "needs-review" | "backlog" | "done";
export const WORK_FILTERS: readonly WorkFilter[] = ["in-progress", "needs-review", "backlog", "done"];

export interface Count {
  done: number;
  total: number;
}

/** Counts, labelled as counts ("6 of 10 stories done"); never a percentage (ADR 0005). */
export interface ProgressCount extends Count {
  label: string;
}

/** One slice of a segmented bar: how many items have this tone. */
export interface Segment {
  tone: Tone;
  count: number;
}

export interface StoryRow {
  id: string;
  type: "story" | "bug";
  title: string;
  stage: string;
  tone: Tone;
  /** Added after the feature's scope baseline. */
  added: boolean;
  criteria: Count;
  tasks: Count;
  pr: string | null;
  /** Who works on it (STORY-9): the card's agent and model, and the chat that is its latest session. Null until started. */
  agent: string | null;
  model: string | null;
  session: string | null;
  /** The user stopped its agent (STORY-53): the row shows Stopped and offers Resume. */
  stopped: boolean;
}

export interface FeatureRow {
  /** Null for the row that holds stories without a feature. */
  id: string | null;
  title: string;
  /** The feature's status (draft, approved, active, done, cancelled); null for the no-feature row. */
  status: string | null;
  /** The chat that drafted the feature (STORY-8), for a review to open. Left out for a card nobody drafted. */
  draftedBy?: string;
  /** A draft an agent made, waiting on the user: the row shows a Review badge. Left out otherwise. */
  review?: true;
  tone: Tone;
  filters: WorkFilter[];
  progress: ProgressCount;
  /** The stories by stage tone, in bar order. */
  bar: Segment[];
  tasks: Count;
  scope: { added: number; openBugs: number };
  stories: StoryRow[];
}

export interface EpicRow {
  /** Null for the group of features without an epic. */
  id: string | null;
  title: string;
  progress: ProgressCount;
  /** The features by status tone, in bar order. */
  bar: Segment[];
  features: FeatureRow[];
}

/** An uncommitted edit to a copy that isn't the owner's, with what the user can do about it. */
export interface StaleRow {
  /** Names the copy in `work.applyCopy` and `work.discardCopy`. */
  key: string;
  cardId: string;
  /** Where the edited copy is, and where the owner is, as labels. */
  where: string;
  owner: string;
  path: string;
}

export interface WorkList {
  epics: EpicRow[];
  stale: StaleRow[];
  problems: string[];
}

export const EMPTY_WORK_LIST: WorkList = { epics: [], stale: [], problems: [] };

// Checks for the client: the list crosses the socket, so every field is read defensively.
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown) => (typeof v === "string" ? v : "");
const textOrNull = (v: unknown) => (typeof v === "string" ? v : null);
const list = <T>(raw: unknown, item: (r: Record<string, unknown>) => T): T[] =>
  Array.isArray(raw) ? raw.filter(isRecord).map(item) : [];
const count = (raw: unknown): Count => {
  const r = isRecord(raw) ? raw : {};
  return { done: num(r.done), total: num(r.total) };
};
const progress = (raw: unknown): ProgressCount => ({ ...count(raw), label: text(isRecord(raw) ? raw.label : "") });
const tone = (v: unknown): Tone => (isOneOf(TONES, v) ? v : "idle");
const bar = (raw: unknown) => list(raw, (s): Segment => ({ tone: tone(s.tone), count: num(s.count) }));

const story = (r: Record<string, unknown>): StoryRow => ({
  id: text(r.id),
  type: r.type === "bug" ? "bug" : "story",
  title: text(r.title),
  stage: text(r.stage),
  tone: tone(r.tone),
  added: r.added === true,
  criteria: count(r.criteria),
  tasks: count(r.tasks),
  pr: textOrNull(r.pr),
  agent: textOrNull(r.agent),
  model: textOrNull(r.model),
  session: textOrNull(r.session),
  stopped: r.stopped === true,
});

const feature = (r: Record<string, unknown>): FeatureRow => {
  const scope = isRecord(r.scope) ? r.scope : {};
  return {
    id: textOrNull(r.id),
    title: text(r.title),
    status: textOrNull(r.status),
    draftedBy: typeof r.draftedBy === "string" ? r.draftedBy : undefined,
    review: r.review === true ? true : undefined,
    tone: tone(r.tone),
    filters: Array.isArray(r.filters) ? r.filters.filter((f): f is WorkFilter => isOneOf(WORK_FILTERS, f)) : [],
    progress: progress(r.progress),
    bar: bar(r.bar),
    tasks: count(r.tasks),
    scope: { added: num(scope.added), openBugs: num(scope.openBugs) },
    stories: list(r.stories, story),
  };
};

const epic = (r: Record<string, unknown>): EpicRow => ({
  id: textOrNull(r.id),
  title: text(r.title),
  progress: progress(r.progress),
  bar: bar(r.bar),
  features: list(r.features, feature),
});

const staleRow = (r: Record<string, unknown>): StaleRow => ({
  key: text(r.key),
  cardId: text(r.cardId),
  where: text(r.where),
  owner: text(r.owner),
  path: text(r.path),
});

export function normalizeWorkList(raw: unknown): WorkList {
  const r = isRecord(raw) ? raw : {};
  return {
    epics: list(r.epics, epic),
    stale: list(r.stale, staleRow),
    problems: Array.isArray(r.problems) ? r.problems.filter((p): p is string => typeof p === "string") : [],
  };
}
