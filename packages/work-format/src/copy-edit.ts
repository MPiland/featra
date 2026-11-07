/**
 * Applying an edit made to a stale copy onto the owner's card (ADR 0016). The edit is what changed between the
 * copy's committed version (the base) and the copy now. Each changed field is copied to the owner, unless the owner
 * changed that field too: then nothing is applied, because two edits are never merged silently.
 */
import { appendHistory, setParent, setStatus } from "./history.ts";
import type { Card, HistoryEvent } from "./types.ts";

export type CopyEditResult = { ok: true; card: Card } | { ok: false; error: string };

/** Card fields an edit can carry. `id`, `type` and `history` are handled on their own. */
const FIELDS = [
  "title",
  "status",
  "parent",
  "order",
  "origin",
  "role",
  "agent",
  "model",
  "reasoning",
  "sessions",
  "branch",
  "pr",
  "created",
  "description",
  "acs",
  "tasks",
  "notes",
  "extraSections",
  "extra",
] as const satisfies readonly (keyof Card)[];

type Field = (typeof FIELDS)[number];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The events `edited` adds after `base`'s, or null when it changed or removed one (history is append-only). */
function addedEvents(base: Card, edited: Card): HistoryEvent[] | null {
  if (edited.history.length < base.history.length) return null;
  for (const [i, event] of base.history.entries()) if (!same(event, edited.history[i])) return null;
  return edited.history.slice(base.history.length);
}

/**
 * The owner's card with the edit applied, or why it can't be. `base` is the edited copy's committed version (null
 * when the copy was never committed: the whole copy is then the edit); `owner` is null when the owner has no copy.
 * Status and parent moves are recorded at the owner through `setStatus` / `setParent`, as by `by` at `at`; other
 * events the edit added are appended as they are.
 */
export function applyCopyEdit(
  base: Card | null,
  edited: Card,
  owner: Card | null,
  by: string,
  at: string,
): CopyEditResult {
  if (!owner) return { ok: true, card: edited };
  if (edited.id !== owner.id) return { ok: false, error: `The copy is ${edited.id}, not ${owner.id}.` };
  if (edited.type !== owner.type) return { ok: false, error: `The copy changes the card's type to ${edited.type}.` };
  const from = base ?? owner;
  const events = base ? addedEvents(base, edited) : [];
  if (!events) return { ok: false, error: "The copy changes earlier history; history is only ever added to." };

  const changed = FIELDS.filter((f) => !same(edited[f], from[f]));
  const conflicts = changed.filter((f) => !same(owner[f], from[f]) && !same(owner[f], edited[f]));
  if (conflicts.length) {
    return { ok: false, error: `The owner changed ${conflicts.join(", ")} too. Edit the owner's copy instead.` };
  }

  let card: Card = owner;
  for (const event of events)
    if (event.field !== "status" && event.field !== "parent") card = appendHistory(card, event);
  const plain = changed.filter((f): f is Exclude<Field, "status" | "parent"> => f !== "status" && f !== "parent");
  card = { ...card, ...Object.fromEntries(plain.map((f) => [f, edited[f]])) };
  if (changed.includes("parent")) card = setParent(card, edited.parent, by, at);
  if (changed.includes("status")) card = setStatus(card, edited.status, by, at);
  return { ok: true, card };
}
