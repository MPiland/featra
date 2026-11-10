/** STORY-50: a send-back is a `sent-back` history event that never counts as the user editing the draft. */
import { describe, expect, it } from "vitest";
import {
  buildCardView,
  DEFAULT_CONFIG,
  MAIN,
  parseCard,
  planDraft,
  recordSentBack,
  sendBackMessage,
  serializeCard,
  userEdited,
  type Card,
} from "../src/index.ts";
import { firstDraft, input, story, T2 } from "./draft-fixtures.ts";

const viewOf = (cards: Card[], id: string) =>
  buildCardView({ card: cards.find((c) => c.id === id) as Card, owner: MAIN, shownFrom: MAIN, path: "x.md" }, true, {
    config: DEFAULT_CONFIG,
    cards,
  });

describe("recordSentBack", () => {
  it("appends a by:user sent-back event carrying the trimmed reason, and keeps older history", () => {
    const { cards, plan } = firstDraft();
    const feature = cards.find((c) => c.id === plan.result.feature) as Card;
    const next = recordSentBack(feature, "  Split it in two.  ", "user", T2);
    expect(next.history.slice(0, -1)).toEqual(feature.history);
    expect(next.history.at(-1)).toEqual({ at: T2, field: "sent-back", from: null, to: "Split it in two.", by: "user" });
  });

  it("survives a round trip through the card file, multi-line reasons included", () => {
    const { cards, plan } = firstDraft();
    const feature = cards.find((c) => c.id === plan.result.feature) as Card;
    const next = recordSentBack(feature, "One.\nTwo: yes.", "user", T2);
    expect(parseCard(serializeCard(next)).history.at(-1)?.to).toBe("One.\nTwo: yes.");
  });
});

describe("sendBackMessage", () => {
  it("names the feature, then gives the reason as written (trimmed)", () => {
    expect(sendBackMessage("FEAT-9", "  Too big. ")).toBe("Sent back FEAT-9: Too big.");
  });
});

describe("a send-back and the draft guard (STORY-8 ruling 5)", () => {
  it("is not a user edit, so the agent's next revision is let through", () => {
    const { cards, plan } = firstDraft();
    const sent = cards.map((c) => (c.id === plan.result.feature ? recordSentBack(c, "Needs more.", "user", T2) : c));
    const feature = sent.find((c) => c.id === plan.result.feature) as Card;
    expect(userEdited(feature, "chat-1")).toBe(false);
    const stories = plan.result.stories.map((id, i) => story({ id, title: i === 1 ? "Review it" : story().title }));
    const revised = planDraft(input(stories, "Shaping v2"), {
      cards: sent,
      config: DEFAULT_CONFIG,
      chat: "chat-1",
      at: "2026-11-10T11:00:00Z",
    });
    expect(revised.ok).toBe(true);
  });

  it("still sees a real user edit made alongside a send-back", () => {
    const { cards, plan } = firstDraft();
    const feature = cards.find((c) => c.id === plan.result.feature) as Card;
    const edited = recordSentBack(
      { ...feature, history: [...feature.history, { at: T2, field: "content", from: "{}", to: "title", by: "user" }] },
      "Needs more.",
      "user",
      T2,
    );
    expect(userEdited(edited, "chat-1")).toBe(true);
  });
});

describe("CardView.draftChat", () => {
  it("names the chat on a draft that waits for review, and is absent otherwise", () => {
    const { cards, plan } = firstDraft();
    expect(viewOf(cards, plan.result.feature).draftChat).toBe("chat-1");
    const approved = cards.map((c) => (c.id === plan.result.feature ? { ...c, status: "approved" } : c));
    expect(viewOf(approved, plan.result.feature).draftChat).toBeUndefined();
    expect(viewOf(cards, plan.result.stories[0] as string).draftChat).toBeUndefined();
  });
});
