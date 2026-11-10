import { describe, expect, it } from "vitest";
import {
  applyCardEdit,
  approvalMessage,
  baselineOf,
  DEFAULT_CONFIG,
  originForNewItem,
  parseCard,
  planApproval,
  scopeBaseline,
  scopeSummary,
  serializeCard,
  setStatus,
  type Card,
} from "../src/index.ts";
import { apply, input, story, T1, T2 } from "./draft-fixtures.ts";

/** A draft of three stories, the second cancelled by a later call. */
function draft(): { cards: Card[]; feature: string } {
  const first = apply([], input([story({ title: "One" }), story({ title: "Two" }), story({ title: "Three" })]));
  const ids = first.plan.result.stories;
  const left = apply(
    first.cards,
    input([story({ id: ids[0] as string, title: "One" }), story({ id: ids[2] as string, title: "Three" })]),
    "chat-1",
    T1,
  );
  return { cards: left.cards, feature: first.plan.result.feature };
}

const AT = "2026-11-10T12:00:00Z";

function approved() {
  const { cards, feature } = draft();
  const plan = planApproval(feature, cards, AT);
  if (!plan.ok) throw new Error(plan.error);
  return { cards, feature, plan };
}

describe("planApproval", () => {
  it("approves the feature by the user, with a status history event, and keeps its drafted-by", () => {
    const { plan } = approved();
    expect(plan.feature.status).toBe("approved");
    expect(plan.feature.history.at(-1)).toEqual({ at: AT, field: "status", from: "draft", to: "approved", by: "user" });
    expect(plan.feature.extra["drafted-by"]).toBe("chat-1");
  });

  it("records the baseline: when, and the live stories in order", () => {
    const { plan } = approved();
    const live = plan.keep.map((s) => s.id);
    expect(live).toHaveLength(2);
    expect(baselineOf(plan.feature)).toEqual({ at: AT, stories: live });
  });

  it("keeps live stories exactly as they are (still New) and drops the cancelled ones", () => {
    const { cards, plan } = approved();
    expect(plan.keep.map((s) => s.status)).toEqual(["New", "New"]);
    for (const kept of plan.keep) expect(kept).toBe(cards.find((c) => c.id === kept.id));
    expect(plan.drop).toHaveLength(1);
    expect(plan.drop[0]?.status).toBe("Cancelled");
    expect(plan.keep.map((s) => s.id)).not.toContain(plan.drop[0]?.id);
  });

  it("survives the card file: the baseline reads back after a write and a parse", () => {
    const { plan } = approved();
    expect(baselineOf(parseCard(serializeCard(plan.feature)))).toEqual(baselineOf(plan.feature));
  });

  it("refuses a feature that has left draft, naming where it is, and a card that isn't a draft", () => {
    const { cards, feature, plan } = approved();
    const after = cards.map((c) => (c.id === feature ? plan.feature : c));
    expect(planApproval(feature, after, T2)).toEqual({ ok: false, error: `${feature} is already approved.` });
    const storyId = plan.keep[0]?.id as string;
    expect(planApproval(storyId, cards, AT)).toEqual({ ok: false, error: `${storyId} isn't a draft.` });
    expect(planApproval("FEAT-99", cards, AT)).toEqual({ ok: false, error: "That card is gone." });
  });

  it("refuses a draft whose stories are all cancelled", () => {
    const { cards, feature } = draft();
    const none = cards.map((c) => (c.parent === feature ? Object.assign({}, c, { status: "Cancelled" }) : c));
    expect(planApproval(feature, none, AT)).toEqual({ ok: false, error: `${feature} has no stories to approve.` });
  });

  it("is the only way out of draft: a status edit through applyCardEdit is still refused", () => {
    const { cards, feature } = draft();
    const card = cards.find((c) => c.id === feature) as Card;
    const edit = { field: "status", from: "draft", to: "approved" } as const;
    const r = applyCardEdit(card, edit, { config: DEFAULT_CONFIG, cards }, "user", AT);
    expect(r.ok).toBe(false);
  });
});

describe("the scope baseline after approval", () => {
  it("is the approval time, before any story starts; an item added after it is added scope", () => {
    const { cards, feature, plan } = approved();
    const after = [...cards.filter((c) => c.id !== feature), plan.feature];
    expect(scopeBaseline(feature, after, DEFAULT_CONFIG)).toBe(AT);
    expect(originForNewItem(feature, "story", after, DEFAULT_CONFIG)).toBe("added");
    expect(scopeSummary(feature, after, DEFAULT_CONFIG).added).toEqual([]);
  });

  it("does not move when a story later starts", () => {
    const { feature, plan } = approved();
    const started = plan.keep.map((s, i) =>
      i === 0 ? setStatus(s, "In Progress", "developer", "2026-11-11T00:00:00Z") : s,
    );
    expect(scopeBaseline(feature, [plan.feature, ...started], DEFAULT_CONFIG)).toBe(AT);
  });

  it("is the first start for a feature with none stored, and null before that", () => {
    const { cards, feature } = draft();
    expect(scopeBaseline(feature, cards, DEFAULT_CONFIG)).toBeNull();
  });
});

describe("approvalMessage", () => {
  it("names the feature and its title on one line", () => {
    expect(approvalMessage({ id: "FEAT-7", title: "  Shaping \n  big " })).toBe("FEAT-7: approved Shaping big");
  });
});
