/**
 * Builds the Work list from the owner copies: epics, their features, the features' stories, and the counts. Every
 * count comes from the rollups (ADR 0003) at the moment the list is built; nothing here is stored.
 */
import { awaitingAcceptance } from "./acceptance.ts";
import { isMerged } from "./history.ts";
import { mergeRefusal } from "./merge.ts";
import { draftedBy, needsReview } from "./card-draft-guard.ts";
import { stageCategory } from "./config.ts";
import { evidenceState } from "./evidence.ts";
import { parseId } from "./ids.ts";
import { locationLabel, type OwnerLocation } from "./ownership.ts";
import type { OwnedCard, Resolution } from "./owner-copies.ts";
import { epicProgress, featureProgress, itemsOf, progressLabel, scopeSummary } from "./rollup.ts";
import { stoppedIn } from "./story-stop.ts";
import { CANCELLED, type Card, type ProjectConfig } from "./types.ts";
import { assertNever } from "./utils/guards.ts";
import type {
  EpicRow,
  FeatureRow,
  ProgressCount,
  Segment,
  StaleRow,
  StoryRow,
  Tone,
  WorkFilter,
  WorkList,
} from "./work-list-types.ts";

/**
 * A story's tone. The first active stage is work in progress; any later active stage (In Review, Acceptance) waits
 * on a review.
 */
export function stageTone(status: string, config: ProjectConfig): Tone {
  if (status === CANCELLED) return "cancelled";
  const category = stageCategory(status, config);
  if (category === "done") return "done";
  if (category !== "active") return "idle";
  return config.stages.find((s) => s.category === "active")?.name === status ? "active" : "review";
}

export function featureTone(status: string): Tone {
  if (status === "done") return "done";
  if (status === "active") return "active";
  if (status === "cancelled") return "cancelled";
  return "idle";
}

/** Which filter chips a feature appears under, from its status and its stories' tones. */
export function featureFilters(status: string | null, storyTones: readonly Tone[], review = false): WorkFilter[] {
  const tones = storyTones.filter((t) => t !== "cancelled");
  const out: WorkFilter[] = [];
  const inProgress = status === null ? tones.some((t) => t === "active" || t === "review") : status === "active";
  if (inProgress) out.push("in-progress");
  if (review || tones.includes("review")) out.push("needs-review");
  const backlog = status === null ? tones.includes("idle") : status === "draft" || status === "approved";
  if (backlog) out.push("backlog");
  const done = status === null ? tones.length > 0 && tones.every((t) => t === "done") : status === "done";
  if (done) out.push("done");
  return out;
}

const BAR_ORDER: readonly Tone[] = ["done", "review", "active", "idle"];

function segments(tones: readonly Tone[]): Segment[] {
  return BAR_ORDER.map((tone) => ({ tone, count: tones.filter((t) => t === tone).length })).filter((s) => s.count);
}

/** Cards in their `order`, then by ID number. */
function byOrder(a: Card, b: Card): number {
  return a.order - b.order || (parseId(a.id)?.n ?? 0) - (parseId(b.id)?.n ?? 0) || a.id.localeCompare(b.id);
}

const labelled = ({ done, total, label }: ProgressCount): ProgressCount => ({ done, total, label });

const ticked = (items: readonly { done: boolean }[]) => ({
  done: items.filter((i) => i.done).length,
  total: items.length,
});

function storyRow(
  card: Card,
  added: ReadonlySet<string>,
  config: ProjectConfig,
  editable: ReadonlySet<string>,
  mergeable: ReadonlySet<string>,
): StoryRow {
  const tone = stageTone(card.status, config);
  return {
    id: card.id,
    type: card.type === "bug" ? "bug" : "story",
    title: card.title,
    stage: card.status,
    tone,
    added: added.has(card.id),
    criteria: ticked(card.acs),
    tasks: ticked(card.tasks),
    pr: card.pr,
    agent: card.agent,
    model: card.model,
    session: card.sessions.at(-1) ?? null,
    ...(evidenceState(card).reported ? { reported: true as const } : {}),
    stopped: stoppedIn(card, tone),
    awaiting: editable.has(card.id) && awaitingAcceptance(card, config),
    mergeable: mergeable.has(card.id),
    merged: isMerged(card),
  };
}

function featureRow(
  feature: Card | null,
  stories: Card[],
  cards: readonly Card[],
  config: ProjectConfig,
  editable: ReadonlySet<string>,
  mergeable: ReadonlySet<string>,
): FeatureRow {
  const scope = feature ? scopeSummary(feature.id, cards, config) : null;
  const added = new Set(scope?.added.map((a) => a.id));
  const rows = stories.toSorted(byOrder).map((s) => storyRow(s, added, config, editable, mergeable));
  const counted = feature ? itemsOf(feature.id, cards) : stories.filter((s) => s.status !== CANCELLED);
  const tones = counted.map((s) => stageTone(s.status, config));
  const done = tones.filter((t) => t === "done").length;
  const tasks = rows.reduce((sum, r) => ({ done: sum.done + r.tasks.done, total: sum.total + r.tasks.total }), {
    done: 0,
    total: 0,
  });
  const openBugs = counted.filter((s) => s.type === "bug" && stageTone(s.status, config) !== "done").length;
  return {
    id: feature?.id ?? null,
    title: feature?.title ?? "",
    status: feature?.status ?? null,
    draftedBy: (feature && draftedBy(feature)) || undefined,
    review: feature && needsReview(feature) ? true : undefined,
    tone: feature ? featureTone(feature.status) : "idle",
    filters: featureFilters(feature?.status ?? null, tones, feature ? needsReview(feature) : false),
    progress: feature
      ? labelled(featureProgress(feature.id, cards, config))
      : { done, total: tones.length, label: progressLabel(done, tones.length, "stories") },
    bar: segments(tones),
    tasks,
    scope: { added: scope?.added.length ?? 0, openBugs: scope?.bugs.open ?? openBugs },
    stories: rows,
  };
}

/** A stable name for one copy, for the client to hand back to apply or discard it. */
export function copyKey(location: OwnerLocation, path: string): string {
  switch (location.kind) {
    case "main":
      return `main|${path}`;
    case "feature":
      return `feature:${location.branch}|${path}`;
    case "worktree":
      return `worktree:${location.path}|${path}`;
    default:
      return assertNever(location);
  }
}

export function buildWorkList(
  resolution: Resolution,
  config: ProjectConfig,
  /** Whether the card can be edited where it is: Accept and Send back show only then, as in the card pane. */
  canEdit: (owned: OwnedCard) => boolean = () => true,
): WorkList {
  const editable = new Set(resolution.cards.filter(canEdit).map((o) => o.card.id));
  const mergeable = new Set(
    resolution.cards.filter((o) => mergeRefusal(o, o.card.id, config, canEdit(o)) === null).map((o) => o.card.id),
  );
  const cards = resolution.cards.map((c) => c.card);
  const epics = cards.filter((c) => c.type === "epic").toSorted(byOrder);
  const features = cards.filter((c) => c.type === "feature").toSorted(byOrder);
  const featureIds = new Set(features.map((f) => f.id));
  const epicIds = new Set(epics.map((e) => e.id));
  const items = cards.filter((c) => c.type === "story" || c.type === "bug");
  const rowOf = (f: Card) =>
    featureRow(
      f,
      items.filter((s) => s.parent === f.id),
      cards,
      config,
      editable,
      mergeable,
    );

  const rows: EpicRow[] = epics.map((e) => {
    const under = features.filter((f) => f.parent === e.id);
    return {
      id: e.id,
      title: e.title,
      progress: labelled(epicProgress(e.id, cards)),
      bar: segments(under.filter((f) => f.status !== "cancelled").map((f) => featureTone(f.status))),
      features: under.map(rowOf),
    };
  });

  const loose = features.filter((f) => !f.parent || !epicIds.has(f.parent)).map(rowOf);
  const orphans = items.filter((s) => !s.parent || !featureIds.has(s.parent));
  if (orphans.length) loose.push(featureRow(null, orphans, cards, config, editable, mergeable));
  if (loose.length) {
    const tones = loose.filter((f) => f.id !== null && f.status !== "cancelled").map((f) => f.tone);
    const done = tones.filter((t) => t === "done").length;
    rows.push({
      id: null,
      title: "",
      progress: { done, total: tones.length, label: progressLabel(done, tones.length, "features") },
      bar: segments(tones),
      features: loose,
    });
  }

  const stale: StaleRow[] = resolution.stale.map((s) => ({
    key: copyKey(s.location, s.path),
    cardId: s.cardId,
    where: locationLabel(s.location),
    owner: locationLabel(s.owner),
    path: s.path,
  }));
  return { epics: rows, stale, problems: resolution.problems };
}
