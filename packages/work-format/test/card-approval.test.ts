import { describe, expect, it } from "vitest";
import {
  applyCardEdit,
  approvalMessage,
  DEFAULT_CONFIG,
  LEGACY_BASELINE,
  newCard,
  originForNewItem,
  parseCard,
  planApproval,
  scopeBaseline,
  scopeSummary,
  serializeCard,
  setStatus,
  startedFeature,
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

  it("records no scope baseline: that is set when the feature goes in progress (ADR 0038)", () => {
    const { plan } = approved();
    expect(plan.keep.map((s) => s.id)).toHaveLength(2);
    expect(plan.feature.extra[LEGACY_BASELINE]).toBeUndefined();
    expect(scopeBaseline(plan.feature.id, [plan.feature, ...plan.keep])).toBeNull();
  });

  it("keeps live stories exactly as they are (still New) and drops the cancelled ones", () => {
    const { cards, plan } = approved();
    expect(plan.keep.map((s) => s.status)).toEqual(["New", "New"]);
    for (const kept of plan.keep) expect(kept).toBe(cards.find((c) => c.id === kept.id));
    expect(plan.drop).toHaveLength(1);
    expect(plan.drop[0]?.status).toBe("Cancelled");
    expect(plan.keep.map((s) => s.id)).not.toContain(plan.drop[0]?.id);
  });

  it("survives the card file: the approved feature reads back after a write and a parse", () => {
    const { plan } = approved();
    expect(parseCard(serializeCard(plan.feature))).toEqual(plan.feature);
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

const START = "2026-11-12T08:00:00Z";
const later = (id: string, feature: string, at: string) =>
  newCard({ id, type: "story", title: id, status: "New", parent: feature }, "user", at);
/** The cards once `feature` is approved, with `more` cards. */
const withFeature = (cards: Card[], feature: Card, ...more: Card[]) => [
  ...cards.filter((c) => c.id !== feature.id),
  feature,
  ...more,
];

describe("AC2: the scope baseline is set when the feature goes in progress, not at approval (ADR 0038)", () => {
  it("is null after approval: a story added before Start is planned scope", () => {
    const { cards, feature, plan } = approved();
    const between = later("STORY-90", feature, "2026-11-11T00:00:00Z");
    const after = withFeature(cards, plan.feature, between);
    expect(scopeBaseline(feature, after)).toBeNull();
    expect(originForNewItem(feature, "story", after)).toBe("planned");
    expect(scopeSummary(feature, after, DEFAULT_CONFIG)).toMatchObject({ baseline: null, added: [] });
  });

  it("is the moment Start moves it to in progress; stories added between approval and Start stay planned", () => {
    const { cards, feature, plan } = approved();
    const between = later("STORY-90", feature, "2026-11-11T00:00:00Z");
    const afterStart = later("STORY-91", feature, "2026-11-12T09:00:00Z");
    const started = startedFeature(plan.feature, "user", START);
    const all = withFeature(cards, started, between, afterStart);
    expect(scopeBaseline(feature, all)).toBe(START);
    expect(originForNewItem(feature, "story", all)).toBe("added");
    const summary = scopeSummary(feature, all, DEFAULT_CONFIG);
    expect(summary.baseline).toBe(START);
    expect(summary.added.map((a) => a.id)).toEqual(["STORY-91"]);
    expect(summary.addedBreakdown).toBe("+1 added: 1 story");
  });

  it("does not move when a story later starts", () => {
    const { feature, plan } = approved();
    const started = plan.keep.map((s, i) =>
      i === 0 ? setStatus(s, "In Progress", "developer", "2026-11-13T00:00:00Z") : s,
    );
    expect(scopeBaseline(feature, [startedFeature(plan.feature, "user", START), ...started])).toBe(START);
  });

  it("is null for a draft", () => {
    const { cards, feature } = draft();
    expect(scopeBaseline(feature, cards)).toBeNull();
  });
});

/** A feature as an approval before ADR 0038 wrote it: with the stored baseline of that time. */
function legacyApproved() {
  const { cards, feature, plan } = approved();
  const stored = { at: AT, stories: plan.keep.map((s) => s.id) };
  return {
    cards,
    feature,
    plan,
    legacy: { ...plan.feature, extra: { ...plan.feature.extra, [LEGACY_BASELINE]: stored } },
  };
}

describe("AC3: a feature approved before this change keeps working", () => {
  it("still parses, and keeps its stored baseline as it was", () => {
    const { legacy } = legacyApproved();
    const read = parseCard(serializeCard(legacy));
    expect(read).toEqual(legacy);
    expect(serializeCard(read)).toContain("baseline:");
  });

  it("has no baseline while it is approved, whatever it stored", () => {
    const { cards, feature, legacy } = legacyApproved();
    const extra = later("STORY-90", feature, "2026-11-10T13:00:00Z");
    const all = withFeature(cards, legacy, extra);
    expect(scopeBaseline(feature, all)).toBeNull();
    expect(scopeSummary(feature, all, DEFAULT_CONFIG).added).toEqual([]);
  });

  it("reads its baseline from its history: the move to in progress, not the stored approval time or list", () => {
    const { cards, feature, legacy } = legacyApproved();
    // Added after approval and not in the stored list, but before Start: planned scope now.
    const between = later("STORY-90", feature, "2026-11-10T13:00:00Z");
    const afterStart = later("STORY-91", feature, "2026-11-12T09:00:00Z");
    const started = parseCard(serializeCard(startedFeature(legacy, "user", START)));
    const all = withFeature(cards, started, between, afterStart);
    expect(scopeBaseline(feature, all)).toBe(START);
    expect(scopeSummary(feature, all, DEFAULT_CONFIG).added.map((a) => a.id)).toEqual(["STORY-91"]);
  });

  it("an old feature started by hand reads the same: the first start, and later joiners are added", () => {
    const approvedOnly = newCard(
      { id: "FEAT-8", type: "feature", title: "Old", status: "approved", parent: null },
      "user",
      "2026-11-01T00:00:00Z",
    );
    const feature = setStatus(approvedOnly, "active", "dev-lead", "2026-11-02T00:00:00Z");
    const first = setStatus(
      later("STORY-80", "FEAT-8", "2026-11-01T00:00:00Z"),
      "In Progress",
      "developer",
      "2026-11-02T00:00:00Z",
    );
    const joiner = later("STORY-81", "FEAT-8", "2026-11-03T00:00:00Z");
    const early = later("STORY-82", "FEAT-8", "2026-11-01T12:00:00Z");
    const summary = scopeSummary("FEAT-8", [feature, first, joiner, early], DEFAULT_CONFIG);
    expect(summary.baseline).toBe("2026-11-02T00:00:00Z");
    expect(summary.added.map((a) => a.id)).toEqual(["STORY-81"]);
    expect(summary.addedLabel).toBe("+1 added since start");
    expect(scopeSummary("FEAT-8", [approvedOnly, early], DEFAULT_CONFIG)).toMatchObject({ baseline: null, added: [] });
  });

  it("a story that joins in the same instant as Start is planned scope", () => {
    const { cards, feature, plan } = approved();
    const same = later("STORY-92", feature, START);
    const all = withFeature(cards, startedFeature(plan.feature, "user", START), same);
    expect(scopeSummary(feature, all, DEFAULT_CONFIG).added).toEqual([]);
  });
});

describe("approvalMessage", () => {
  it("names the feature and its title on one line", () => {
    expect(approvalMessage({ id: "FEAT-7", title: "  Shaping \n  big " })).toBe("FEAT-7: approved Shaping big");
  });
});
