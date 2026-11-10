import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  draftedBy,
  DRAFT_LIMITS,
  openDraft,
  parseCard,
  parseDraft,
  parseDraftResult,
  planDraft,
  serializeCard,
  type Card,
} from "../src/index.ts";
import { apply, existing, input, patched, story, T1 } from "./draft-fixtures.ts";

describe("what draft_cards takes", () => {
  it("accepts a feature with stories and trims text to one line where it is a line", () => {
    const parsed = parseDraft({
      feature: { title: "  Shap\ning ", description: "Line one.\nLine two." },
      stories: [{ title: "A  story", story: "As a builder, I draft.", criteria: ["It works\n"], tasks: ["Do it"] }],
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        feature: { title: "Shap ing", description: "Line one.\nLine two." },
        stories: [
          { id: null, title: "A story", story: "As a builder, I draft.", criteria: ["It works"], tasks: ["Do it"] },
        ],
      },
    });
  });

  it.each<[string, unknown, string]>([
    ["nothing", undefined, '"feature" is required'],
    ["no feature title", { feature: { description: "d" }, stories: [{}] }, "feature.title"],
    ["no feature description", { feature: { title: "t" }, stories: [{}] }, "feature.description"],
    ["no stories", { feature: { title: "t", description: "d" }, stories: [] }, '"stories" is required'],
    [
      "a story that isn't an object",
      { feature: { title: "t", description: "d" }, stories: ["x"] },
      "stories[0] must be an object",
    ],
    [
      "a story without a user story",
      { feature: { title: "t", description: "d" }, stories: [{ title: "s", criteria: ["c"] }] },
      '"story" is required',
    ],
    [
      "a story without criteria",
      { feature: { title: "t", description: "d" }, stories: [{ title: "s", story: "x" }] },
      '"criteria" needs at least 1',
    ],
    [
      "criteria that aren't a list",
      { feature: { title: "t", description: "d" }, stories: [{ title: "s", story: "x", criteria: "c" }] },
      "must be a list",
    ],
    [
      "a task that is blank",
      {
        feature: { title: "t", description: "d" },
        stories: [{ title: "s", story: "x", criteria: ["c"], tasks: [" "] }],
      },
      '"tasks" is required',
    ],
    [
      "an id that isn't a story's",
      {
        feature: { title: "t", description: "d" },
        stories: [{ id: "FEAT-1", title: "s", story: "x", criteria: ["c"] }],
      },
      "story id",
    ],
    [
      "a description with a heading",
      { feature: { title: "t", description: "Text\n## Tasks\n- [ ] x" }, stories: [{}] },
      "can't hold a heading",
    ],
  ])("refuses %s, saying what to fix", (_name, raw, message) => {
    const parsed = parseDraft(raw);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.error).toContain(message);
  });

  it("refuses text that is too long, too many stories and an id given twice", () => {
    const base = { title: "s", story: "x", criteria: ["c"] };
    const f = { title: "t", description: "d" };
    expect(parseDraft({ feature: { ...f, title: "x".repeat(DRAFT_LIMITS.title + 1) }, stories: [base] })).toMatchObject(
      { ok: false },
    );
    expect(
      parseDraft({ feature: f, stories: Array.from({ length: DRAFT_LIMITS.stories + 1 }, () => base) }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("too many"),
    });
    expect(
      parseDraft({
        feature: f,
        stories: [
          { ...base, id: "STORY-1" },
          { ...base, id: "STORY-1" },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: "STORY-1 is given for more than one story.",
    });
  });

  it("checks the server's answer", () => {
    const result = { feature: "FEAT-1", stories: ["STORY-1"], created: true, changed: ["FEAT-1"], cancelled: [] };
    expect(parseDraftResult(result)).toEqual(result);
    expect(parseDraftResult({ ...result, created: "yes" })).toBeNull();
    expect(parseDraftResult(null)).toBeNull();
  });
});

describe("a first call makes a Draft feature with its stories", () => {
  it("gives the feature the draft status and each story its user story, criteria and tasks", () => {
    const { cards, plan } = apply(
      existing(),
      input([story(), story({ title: "Review it", criteria: ["A", "B"], tasks: [] })]),
    );
    const feature = cards.find((c) => c.id === plan.result.feature);
    expect(feature).toMatchObject({ type: "feature", status: "draft", parent: null, title: "Shaping" });
    const stories = plan.result.stories.map((id) => cards.find((c) => c.id === id));
    expect(stories[0]).toMatchObject({
      type: "story",
      status: "New",
      parent: feature?.id,
      role: "developer",
      order: 1,
    });
    expect(stories[0]?.description).toContain("As a builder");
    expect(stories[1]?.acs.map((a) => a.text)).toEqual(["A", "B"]);
    expect(stories[0]?.tasks).toEqual([{ text: "Add the tool", done: false }]);
    expect(plan.result).toMatchObject({ created: true, cancelled: [] });
    expect(plan.result.changed).toEqual([plan.result.feature, ...plan.result.stories]);
  });

  it("allocates IDs with nextId: one past the highest of each kind, never an ID the project has", () => {
    const { plan } = apply(existing(), input([story(), story({ title: "Two" })]));
    expect(plan.result.feature).toBe("FEAT-4");
    expect(plan.result.stories).toEqual(["STORY-8", "STORY-9"]);
  });

  it("records who drafted it and when in each card's first history event, and the chat on the feature", () => {
    const { cards, plan } = apply(existing(), input());
    const feature = cards.find((c) => c.id === plan.result.feature);
    expect(feature?.history).toEqual([{ at: T1, field: "status", from: null, to: "draft", by: "session:chat-1" }]);
    expect(draftedBy(feature as Card)).toBe("chat-1");
    expect(feature?.order).toBe(5);
  });

  it("survives the card file: serialized and parsed back, the chat and the content are kept", () => {
    const { cards, plan } = apply(existing(), input());
    const feature = cards.find((c) => c.id === plan.result.feature) as Card;
    const back = parseCard(serializeCard(feature));
    expect(back).toEqual(feature);
    const saved = parseCard(serializeCard(cards.find((c) => c.id === plan.result.stories[0]) as Card));
    expect(saved.acs).toEqual([{ text: "The draft shows in Work", done: false, test: null }]);
  });

  it("makes a new draft for each chat, and a chat's second feature once the first is approved", () => {
    const a = apply(existing(), input(), "chat-a");
    const b = apply(a.cards, input([story()], "Other"), "chat-b");
    expect(b.plan.result).toMatchObject({ created: true, feature: "FEAT-5" });
    expect(a.cards.filter((c) => c.type === "feature" && c.status === "draft")).toHaveLength(1);
    const approved = patched(a.cards, a.plan.result.feature, { status: "approved" });
    expect(openDraft("chat-a", approved)).toBeNull();
    expect(apply(approved, input(), "chat-a").plan.result).toMatchObject({ created: true, feature: "FEAT-5" });
  });

  it("refuses an id for a story the chat has no draft of, writing nothing", () => {
    const planned = planDraft(input([story({ id: "STORY-7" })]), {
      cards: existing(),
      config: DEFAULT_CONFIG,
      chat: "c",
      at: T1,
    });
    expect(planned).toEqual({ ok: false, error: `STORY-7 isn't in a draft of yours. Leave "id" out for a new story.` });
  });
});
