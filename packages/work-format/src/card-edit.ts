/**
 * One edit from the card pane, applied to the owner's card (ADR 0017). Pure: the server reads the owner's copy and
 * writes the result. An edit carries the value the pane showed, and is refused when the owner's copy has another
 * value now, so a change made elsewhere is never written over. Status and parent moves go through `history.ts`.
 */
import { parseCard, serializeCard } from "./card.ts";
import {
  CONTAINER_STATUS_LABELS,
  type CardEdit,
  type CardItemField,
  type CardOption,
  type CardTextField,
} from "./card-view-types.ts";
import { checkTransition } from "./evidence.ts";
import { needsReview } from "./card-draft-guard.ts";
import { appendHistory, setParent, setStatus } from "./history.ts";
import { CANCELLED, CONTAINER_STATUSES, type Card, type ProjectConfig } from "./types.ts";

export type CardEditResult = { ok: true; card: Card } | { ok: false; error: string };

export const CHANGED_ELSEWHERE = "Changed since you opened it.";

export interface CardEditContext {
  config: ProjectConfig;
  /** Every card in the project, for the parent choices and a feature's Done check. */
  cards: readonly Card[];
}

/** The statuses the rules let the card move to, in workflow order, with its current one. */
export function statusChoices(card: Card, { config, cards }: CardEditContext): CardOption[] {
  // A draft leaves draft by Approve (STORY-51), never from this list.
  if (needsReview(card)) return [{ value: card.status, label: CONTAINER_STATUS_LABELS[card.status] ?? card.status }];
  const work = card.type === "story" || card.type === "bug";
  const all = work ? [...config.stages.map((s) => s.name), CANCELLED] : [...CONTAINER_STATUSES];
  if (!all.includes(card.status)) all.unshift(card.status);
  return all
    .filter((s) => s === card.status || checkTransition(card, s, config, cards).ok)
    .map((s) => ({ value: s, label: work ? s : (CONTAINER_STATUS_LABELS[s] ?? s) }));
}

/** The parents the card can move under: features for a story or bug, epics for a feature, none for an epic. */
export function parentChoices(card: Card, { cards }: CardEditContext): CardOption[] {
  if (card.type === "epic") return [];
  const kind = card.type === "feature" ? "epic" : "feature";
  const none: CardOption = { value: null, label: kind === "epic" ? "No epic" : "No feature" };
  const parents = cards
    .filter((c) => c.type === kind)
    .toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((c): CardOption => ({ value: c.id, label: `${c.id} · ${c.title}` }));
  return [none, ...parents];
}

const oneLine = (s: string) => s.replace(/\s*\r?\n\s*/g, " ").trim();
const block = (s: string) => s.replace(/\r\n/g, "\n").trim();
const refuse = (error: string): CardEditResult => ({ ok: false, error });

/** Why an AC's or task's text can't change from `from` to `to`, or null when it can. */
function itemError(item: { text: string } | undefined, edit: { from: string; to: string }): string | null {
  if (!item || item.text !== edit.from) return CHANGED_ELSEWHERE;
  return oneLine(edit.to) ? null : "An item needs text.";
}

type TextEdit = Extract<CardEdit, { field: CardTextField }>;
type ItemEdit = Extract<CardEdit, { field: CardItemField }>;

function withText(card: Card, edit: TextEdit): CardEditResult {
  if (card[edit.field] !== edit.from) return refuse(CHANGED_ELSEWHERE);
  if (edit.field !== "title") return { ok: true, card: { ...card, [edit.field]: block(edit.to) } };
  const title = oneLine(edit.to);
  return title ? { ok: true, card: { ...card, title } } : refuse("A card needs a title.");
}

function withItem(card: Card, edit: ItemEdit): CardEditResult {
  const text = oneLine(edit.to);
  if (edit.field === "ac") {
    const item = card.acs[edit.index];
    const error = itemError(item, edit);
    if (error !== null || !item) return refuse(error ?? CHANGED_ELSEWHERE);
    return { ok: true, card: { ...card, acs: card.acs.with(edit.index, { ...item, text }) } };
  }
  const item = card.tasks[edit.index];
  const error = itemError(item, edit);
  if (error !== null || !item) return refuse(error ?? CHANGED_ELSEWHERE);
  return { ok: true, card: { ...card, tasks: card.tasks.with(edit.index, { ...item, text }) } };
}

/** JSON with object keys sorted, so two values compare by content, not by key order. */
const canonical = (value: unknown) =>
  JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).toSorted(([a], [b]) => a.localeCompare(b)))
      : v,
  );

const KEY_OF = { title: "title", description: "description", notes: "notes", ac: "acs", task: "tasks" } as const;

/** True when the edited field reads back from the file as typed: text that reads as markup (a `## ` line) doesn't. */
function survivesFile(card: Card, field: keyof typeof KEY_OF): boolean {
  const key = KEY_OF[field];
  try {
    return canonical(parseCard(serializeCard(card))[key]) === canonical(card[key]);
  } catch {
    return false;
  }
}

/** What a text edit changed, as a `content` event names it (the vocabulary a draft's own events use). */
function partOf(card: Card, field: CardTextField | CardItemField): string {
  if (field === "description") return card.type === "feature" ? "description" : "story";
  return { title: "title", notes: "notes", ac: "criteria", task: "tasks" }[field];
}

/** The old value of that part, as the event's `from` records it. */
function oldPart(card: Card, part: string): unknown {
  switch (part) {
    case "title":
      return card.title;
    case "notes":
      return card.notes;
    case "criteria":
      return card.acs.map((a) => a.text);
    case "tasks":
      return card.tasks.map((t) => t.text);
    default:
      return card.description;
  }
}

/** `edited` with a `by` content event for the text edit that made it from `card`; `card` itself when nothing changed. */
function recorded(card: Card, edited: Card, field: CardTextField | CardItemField, by: string, at: string): Card {
  const part = partOf(card, field);
  if (canonical(oldPart(card, part)) === canonical(oldPart(edited, part))) return card;
  const from = JSON.stringify({ [part]: oldPart(card, part) });
  return appendHistory(edited, { at, field: "content", from, to: part, by });
}

/** The owner's card with `edit` applied, as by `by` at `at`, or why it can't be. */
export function applyCardEdit(
  card: Card,
  edit: CardEdit,
  ctx: CardEditContext,
  by: string,
  at: string,
): CardEditResult {
  let result: CardEditResult;
  if (edit.field === "status") {
    if (card.status !== edit.from) return refuse(CHANGED_ELSEWHERE);
    if (edit.to === card.status) return { ok: true, card };
    const check = checkTransition(card, edit.to, ctx.config, ctx.cards);
    if (!check.ok) return refuse(`Can't move to ${edit.to}: ${check.reason}.`);
    result = { ok: true, card: setStatus(card, edit.to, by, at) };
  } else if (edit.field === "parent") {
    if (card.parent !== edit.from) return refuse(CHANGED_ELSEWHERE);
    if (edit.to === card.parent) return { ok: true, card };
    if (!parentChoices(card, ctx).some((o) => o.value === edit.to)) return refuse(`Can't move under ${edit.to}.`);
    result = { ok: true, card: setParent(card, edit.to, by, at) };
  } else {
    result = "index" in edit ? withItem(card, edit) : withText(card, edit);
    if (result.ok && !survivesFile(result.card, edit.field)) return refuse("That text can't be saved as typed.");
    if (result.ok) result = { ok: true, card: recorded(card, result.card, edit.field, by, at) };
  }
  return result;
}
