// Cards and calls for the draft tests: plain data and one helper that applies a plan's writes as the server writes them.
import {
  DEFAULT_CONFIG,
  newCard,
  planDraft,
  type Card,
  type DraftInput,
  type DraftPlan,
  type DraftStory,
} from "../src/index.ts";

export const T1 = "2026-11-10T09:00:00Z";
export const T2 = "2026-11-10T10:00:00Z";

export const story = (extra: Partial<DraftStory> = {}): DraftStory => ({
  id: null,
  title: "Draft a feature",
  story: "As a builder, I talk a feature through, so that it becomes cards.",
  criteria: ["The draft shows in Work"],
  tasks: ["Add the tool"],
  ...extra,
});
export const input = (stories: DraftStory[] = [story()], title = "Shaping"): DraftInput => ({
  feature: { title, description: "Talk a feature through with the Dev Lead." },
  stories,
});

/** Plans a call and applies its writes to `cards`, as the server writes them. */
export function apply(cards: Card[], draft: DraftInput, chat = "chat-1", at = T1): { cards: Card[]; plan: DraftPlan } {
  const planned = planDraft(draft, { cards, config: DEFAULT_CONFIG, chat, at });
  if (!planned.ok) throw new Error(planned.error);
  const written = new Map(planned.value.writes.map((w) => [w.card.id, w.card]));
  const next = [
    ...cards.map((c) => written.get(c.id) ?? c),
    ...planned.value.writes.filter((w) => w.created).map((w) => w.card),
  ];
  return { cards: next, plan: planned.value };
}

export const existing = (): Card[] => [
  newCard({ id: "FEAT-3", type: "feature", title: "Sessions", status: "done", order: 4 }, "user", T1),
  newCard({ id: "STORY-7", type: "story", title: "Old", status: "Done", parent: "FEAT-3" }, "user", T1),
  newCard({ id: "BUG-2", type: "bug", title: "A bug", status: "New" }, "user", T1),
];

/** `cards` with the card `id` changed by `patch`. */
export const patched = (cards: Card[], id: string, patch: Partial<Card>): Card[] =>
  cards.map((c) => (c.id === id ? Object.assign({}, c, patch) : c));

/** A first call with two stories, applied to the existing cards. */
export const firstDraft = () => apply(existing(), input([story(), story({ title: "Review it" })]));
