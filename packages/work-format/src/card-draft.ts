/**
 * What a `draft_cards` call does to the cards (STORY-8, ADR 0021): makes a Draft feature with its stories, or revises
 * the draft the same chat made before, in place. Pure: it takes the project's cards and returns the cards to write, so
 * the server only reads, allocates nothing of its own and writes. IDs come from `nextId`, the one allocator (ADR 0002).
 */
import { newCard } from "./card.ts";
import {
  DRAFTED_BY,
  draftAuthor,
  draftedFeature,
  editedError,
  leftDraftError,
  openDraft,
  sameContent,
  stamped,
  started,
  startedError,
  userEdited,
} from "./card-draft-guard.ts";
import type { DraftInput, DraftResult, DraftStory } from "./card-draft-input.ts";
import { appendHistory, setStatus } from "./history.ts";
import { nextId } from "./ids.ts";
import type { Parsed } from "./knowledge-log.ts";
import {
  CANCELLED,
  type AcceptanceCriterion,
  type Card,
  type CardType,
  type ChecklistItem,
  type ProjectConfig,
} from "./types.ts";

export interface DraftContext {
  /** Every card of the project, as its owner has it. */
  cards: readonly Card[];
  config: ProjectConfig;
  /** The chat making the call: the secret's, never the input's. */
  chat: string;
  /** Now, as an ISO timestamp. */
  at: string;
  /** IDs to treat as used though no card shows them yet: ones another call has just made. */
  taken?: readonly string[];
}

export interface DraftWrite {
  card: Card;
  /** True for a card the project doesn't have yet. */
  created: boolean;
}

export interface DraftPlan {
  result: DraftResult;
  /** Only the cards that are new or changed, so an unchanged card gets no history. */
  writes: DraftWrite[];
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Checklist items for `texts`: one the card already had keeps its tick (and an AC its test link). */
function keep<T extends ChecklistItem>(old: readonly T[], texts: readonly string[], blank: T): T[] {
  return texts.map((text) => ({ ...(old.find((o) => o.text === text) ?? blank), text }));
}

const criteria = (old: readonly AcceptanceCriterion[], texts: readonly string[]) =>
  keep(old, texts, { text: "", done: false, test: null });
const tasks = (old: readonly ChecklistItem[], texts: readonly string[]) => keep(old, texts, { text: "", done: false });

/** What changed in a story, named as a history event's `to`: empty when nothing did. */
function storyChanges(old: Card, story: DraftStory, order: number): string[] {
  return [
    old.title !== story.title && "title",
    old.description !== story.story && "story",
    !same(
      old.acs.map((a) => a.text),
      story.criteria,
    ) && "criteria",
    !same(
      old.tasks.map((t) => t.text),
      story.tasks,
    ) && "tasks",
    old.order !== order && "order",
  ].filter((part): part is string => part !== false);
}

/** A `content` event naming what changed in `to` and, in `from`, the values the card had before (JSON). */
function noted(card: Card, parts: readonly string[], old: Record<string, unknown>, ctx: DraftContext): Card {
  if (!parts.length) return card;
  const before = Object.fromEntries(parts.filter((p) => p in old).map((p) => [p, old[p]]));
  const from = Object.keys(before).length ? JSON.stringify(before) : null;
  return appendHistory(card, { at: ctx.at, field: "content", from, to: parts.join(", "), by: draftAuthor(ctx.chat) });
}

const oldStory = (c: Card) => ({
  title: c.title,
  story: c.description,
  criteria: c.acs.map((a) => a.text),
  tasks: c.tasks.map((t) => t.text),
  order: c.order,
});

/** The first stage a story can start in. */
const firstStage = (config: ProjectConfig) =>
  (config.stages.find((s) => s.category === "not-started") ?? config.stages[0])?.name ?? "New";

/** A story as the draft has it now, from the old card when there was one; the changes it needed are in its history. */
function reviseStory(old: Card, story: DraftStory, order: number, ctx: DraftContext): { card: Card; changed: boolean } {
  const by = draftAuthor(ctx.chat);
  const changes = storyChanges(old, story, order);
  const revived = old.status === CANCELLED;
  // Merging in what the user wrote: nothing to change, but the draft takes it as its own from here.
  const parts = !changes.length && userEdited(old, ctx.chat) ? ["merged"] : changes;
  let card: Card = {
    ...old,
    title: story.title,
    description: story.story,
    acs: criteria(old.acs, story.criteria),
    tasks: tasks(old.tasks, story.tasks),
    order,
  };
  if (revived) card = setStatus(card, firstStage(ctx.config), by, ctx.at);
  card = stamped(noted(card, parts, oldStory(old), ctx));
  return { card, changed: parts.length > 0 || revived };
}

function newStory(story: DraftStory, id: string, parent: string, order: number, ctx: DraftContext): Card {
  return stamped(
    newCard(
      {
        id,
        type: "story",
        title: story.title,
        status: firstStage(ctx.config),
        parent,
        order,
        role: "developer",
        description: story.story,
        acs: criteria([], story.criteria),
        tasks: tasks([], story.tasks),
      },
      draftAuthor(ctx.chat),
      ctx.at,
    ),
  );
}

/** Hands out IDs from `nextId`, counting the ones it has already given and the ones the caller says are taken. */
function allocator(cards: readonly Card[], more: readonly string[] = []) {
  const taken = new Set([...cards.map((c) => c.id), ...more]);
  return (type: CardType) => {
    const id = nextId(type, taken);
    taken.add(id);
    return id;
  };
}

/** Why the call can't write: stories already started, or cards the user edited. Null when it can. */
function refusal(input: DraftInput, open: Card, old: readonly Card[], ctx: DraftContext): string | null {
  const first = firstStage(ctx.config);
  const named = new Map(input.stories.flatMap((s) => (s.id ? [[s.id, s] as const] : [])));
  const left = old.filter((o) => started(o, first) && !named.has(o.id));
  const changed = old.filter((o) => {
    const story = named.get(o.id);
    return story && started(o, first) && !sameContent(o, story);
  });
  if (left.length || changed.length) return startedError(left, changed);

  const { title, description } = input.feature;
  const featureEdited = userEdited(open, ctx.chat) && (open.title !== title || open.description !== description);
  const edited = [
    ...(featureEdited ? [open] : []),
    ...old.filter((o) => {
      const story = named.get(o.id);
      if (o.status === CANCELLED || !userEdited(o, ctx.chat)) return false;
      return !story || !sameContent(o, story);
    }),
  ];
  return edited.length ? editedError(edited) : null;
}

/**
 * The cards a call writes. The chat's open draft is revised in place: a story given with its `id` is updated, one
 * without is new, and one the call leaves out is Cancelled (a draft story is never deleted, so history keeps it). A
 * revision is refused whole when the feature has left draft, when the user edited a card it would change, or when it
 * would leave out or change a story that has started. Without an open draft, the call makes a new Draft feature, owned
 * by main and not committed.
 */
export function planDraft(input: DraftInput, ctx: DraftContext): Parsed<DraftPlan> {
  const by = draftAuthor(ctx.chat);
  const mine = draftedFeature(ctx.chat, ctx.cards);
  if (mine && mine.status !== "draft") return { ok: false, error: leftDraftError(mine) };
  const open = openDraft(ctx.chat, ctx.cards);
  const allocate = allocator(ctx.cards, ctx.taken);
  const old = open ? ctx.cards.filter((c) => c.type === "story" && c.parent === open.id) : [];
  for (const story of input.stories) {
    if (story.id && !old.some((o) => o.id === story.id)) {
      const where = open ? `a story of ${open.id}` : "in a draft of yours";
      return { ok: false, error: `${story.id} isn't ${where}. Leave "id" out for a new story.` };
    }
  }
  const refused = open ? refusal(input, open, old, ctx) : null;
  if (refused) return { ok: false, error: refused };

  const first = firstStage(ctx.config);
  const writes: DraftWrite[] = [];
  const featureId = open?.id ?? allocate("feature");
  const ids: string[] = [];
  const changed: string[] = [];
  let storiesChanged = !open;
  for (const [at, story] of input.stories.entries()) {
    const was = old.find((o) => o.id === story.id);
    if (was && started(was, first)) {
      ids.push(was.id);
    } else if (was) {
      const revised = reviseStory(was, story, at + 1, ctx);
      ids.push(was.id);
      if (revised.changed) writes.push({ card: revised.card, created: false });
      if (revised.changed) changed.push(was.id);
      if (was.status === CANCELLED) storiesChanged = true;
    } else {
      const id = allocate("story");
      ids.push(id);
      changed.push(id);
      storiesChanged = true;
      writes.push({ card: newStory(story, id, featureId, at + 1, ctx), created: true });
    }
  }
  const cancelled = old.filter((o) => o.status !== CANCELLED && !ids.includes(o.id));
  for (const gone of cancelled) {
    writes.push({ card: stamped(setStatus(gone, CANCELLED, by, ctx.at)), created: false });
    changed.push(gone.id);
    storiesChanged = true;
  }

  const { title, description } = input.feature;
  if (open) {
    const parts = [
      open.title !== title && "title",
      open.description !== description && "description",
      storiesChanged && "stories",
    ].filter((part): part is string => part !== false);
    const named = !parts.length && userEdited(open, ctx.chat) ? ["merged"] : parts;
    const was = {
      title: open.title,
      description: open.description,
      stories: old.filter((o) => o.status !== CANCELLED).map((o) => o.id),
    };
    if (named.length > 0) {
      changed.unshift(open.id);
      writes.unshift({ card: stamped(noted({ ...open, title, description }, named, was, ctx)), created: false });
    }
  } else {
    const order = Math.max(0, ...ctx.cards.filter((c) => c.type === "feature" && !c.parent).map((c) => c.order)) + 1;
    const feature = newCard({ id: featureId, type: "feature", title, status: "draft", order, description }, by, ctx.at);
    changed.unshift(featureId);
    writes.unshift({ card: stamped({ ...feature, extra: { [DRAFTED_BY]: ctx.chat } }), created: true });
  }
  const result: DraftResult = {
    feature: featureId,
    stories: ids,
    created: !open,
    changed,
    cancelled: cancelled.map((c) => c.id),
  };
  return { ok: true, value: { result, writes } };
}
