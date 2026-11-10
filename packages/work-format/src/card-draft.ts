/**
 * What a `draft_cards` call does to the cards (STORY-8, ADR 0021): makes a Draft feature with its stories, or revises
 * the draft the same chat made before, in place. Pure: it takes the project's cards and returns the cards to write, so
 * the server only reads, allocates nothing of its own and writes. IDs come from `nextId`, the one allocator (ADR 0002).
 */
import { newCard } from "./card.ts";
import type { DraftInput, DraftResult, DraftStory } from "./card-draft-input.ts";
import { appendHistory, setStatus } from "./history.ts";
import { nextId, parseId } from "./ids.ts";
import type { Parsed } from "./knowledge-log.ts";
import {
  CANCELLED,
  type AcceptanceCriterion,
  type Card,
  type CardType,
  type ChecklistItem,
  type ProjectConfig,
} from "./types.ts";

/** The frontmatter key that names the chat that drafted a feature: how a review finds its way back to that chat. */
export const DRAFTED_BY = "drafted-by";

/** The chat that drafted a feature, or null for a card nobody drafted. */
export function draftedBy(card: Card): string | null {
  const chat = card.extra[DRAFTED_BY];
  return typeof chat === "string" && chat ? chat : null;
}

/** A draft feature a chat made and nobody has approved yet: the one its next `draft_cards` call revises. */
export function openDraft(chat: string, cards: readonly Card[]): Card | null {
  const mine = cards.filter((c) => c.type === "feature" && c.status === "draft" && draftedBy(c) === chat);
  return mine.toSorted((a, b) => (parseId(a.id)?.n ?? 0) - (parseId(b.id)?.n ?? 0)).at(-1) ?? null;
}

/** Whether a feature waits for a review: a draft an agent made. */
export const needsReview = (card: Pick<Card, "status" | "extra">): boolean =>
  card.status === "draft" && typeof card.extra[DRAFTED_BY] === "string";

/** Who a draft's history names: the chat's session. */
export const draftAuthor = (chat: string) => `session:${chat}`;

export interface DraftContext {
  /** Every card of the project, as its owner has it. */
  cards: readonly Card[];
  config: ProjectConfig;
  /** The chat making the call: the secret's, never the input's. */
  chat: string;
  /** Now, as an ISO timestamp. */
  at: string;
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
function storyChanges(old: Card, story: DraftStory): string[] {
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
  ].filter((part): part is string => part !== false);
}

const noted = (card: Card, parts: readonly string[], by: string, at: string): Card =>
  parts.length ? appendHistory(card, { at, field: "content", from: null, to: parts.join(", "), by }) : card;

/** The first stage a story can start in. */
const firstStage = (config: ProjectConfig) =>
  (config.stages.find((s) => s.category === "not-started") ?? config.stages[0])?.name ?? "New";

/** A story as the draft has it now, from the old card when there was one; the changes it needed are in its history. */
function reviseStory(old: Card, story: DraftStory, order: number, ctx: DraftContext): { card: Card; changed: boolean } {
  const by = draftAuthor(ctx.chat);
  const parts = storyChanges(old, story);
  const revived = old.status === CANCELLED;
  let card: Card = {
    ...old,
    title: story.title,
    description: story.story,
    acs: criteria(old.acs, story.criteria),
    tasks: tasks(old.tasks, story.tasks),
    order,
  };
  if (revived) card = setStatus(card, firstStage(ctx.config), by, ctx.at);
  card = noted(card, parts, by, ctx.at);
  return { card, changed: parts.length > 0 || revived || old.order !== order };
}

function newStory(story: DraftStory, id: string, parent: string, order: number, ctx: DraftContext): Card {
  return newCard(
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
  );
}

/** Hands out IDs from `nextId`, counting the ones it has already given. */
function allocator(cards: readonly Card[]) {
  const taken = new Set(cards.map((c) => c.id));
  return (type: CardType) => {
    const id = nextId(type, taken);
    taken.add(id);
    return id;
  };
}

/**
 * The cards a call writes. The chat's open draft is revised in place: a story given with its `id` is updated, one
 * without is new, and one the call leaves out is Cancelled (a draft story is never deleted, so history keeps it).
 * Without an open draft, the call makes a new Draft feature, owned by main and not committed.
 */
export function planDraft(input: DraftInput, ctx: DraftContext): Parsed<DraftPlan> {
  const by = draftAuthor(ctx.chat);
  const open = openDraft(ctx.chat, ctx.cards);
  const allocate = allocator(ctx.cards);
  const old = open ? ctx.cards.filter((c) => c.type === "story" && c.parent === open.id) : [];
  for (const story of input.stories) {
    if (story.id && !old.some((o) => o.id === story.id)) {
      const where = open ? `a story of ${open.id}` : "in a draft of yours";
      return { ok: false, error: `${story.id} isn't ${where}. Leave "id" out for a new story.` };
    }
  }

  const writes: DraftWrite[] = [];
  const featureId = open?.id ?? allocate("feature");
  const ids: string[] = [];
  const changed: string[] = [];
  let storiesChanged = !open;
  for (const [at, story] of input.stories.entries()) {
    const was = old.find((o) => o.id === story.id);
    if (was) {
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
    writes.push({ card: setStatus(gone, CANCELLED, by, ctx.at), created: false });
    changed.push(gone.id);
    storiesChanged = true;
  }

  const { title, description } = input.feature;
  let feature: Card;
  if (open) {
    const parts = [
      open.title !== title && "title",
      open.description !== description && "description",
      storiesChanged && "stories",
    ].filter((part): part is string => part !== false);
    feature = noted({ ...open, title, description }, parts, by, ctx.at);
    if (parts.length > 0) {
      changed.unshift(open.id);
      writes.unshift({ card: feature, created: false });
    }
  } else {
    const order = Math.max(0, ...ctx.cards.filter((c) => c.type === "feature" && !c.parent).map((c) => c.order)) + 1;
    feature = newCard({ id: featureId, type: "feature", title, status: "draft", order, description }, by, ctx.at);
    feature = { ...feature, extra: { [DRAFTED_BY]: ctx.chat } };
    changed.unshift(featureId);
    writes.unshift({ card: feature, created: true });
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
