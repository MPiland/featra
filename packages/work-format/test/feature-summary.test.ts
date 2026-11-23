/**
 * STORY-69 AC6: the Dev Lead's summary of a feature, kept as the card's `## Summary` section with a `summary` event in
 * its history. Real parser, writer and card round trip.
 */
import { describe, expect, it } from "vitest";
import {
  parseCard,
  parseSummaryInput,
  serializeCard,
  SUMMARY_LIMIT,
  SUMMARY_MESSAGES,
  summaryOf,
  withSummary,
} from "../src/index.ts";
import { at, feature } from "./fixtures.ts";

const LEAD = "session:chat-1";

describe("the Dev Lead's summary of a feature (AC6)", () => {
  it("is kept in the card, with who wrote it and when, and survives writing the card and reading it back", () => {
    const card = withSummary(feature("FEAT-9"), "Review a feature on one screen.", LEAD, at(5));
    const again = parseCard(serializeCard(card));
    expect(summaryOf(again)).toEqual({ text: "Review a feature on one screen.", at: at(5) });
    expect(again.history.at(-1)).toEqual({ at: at(5), field: "summary", from: null, to: null, by: LEAD });
  });

  it("replaces the summary before it and keeps the card's other sections", () => {
    const base = { ...feature("FEAT-9"), extraSections: [{ heading: "Risks", content: "None." }] };
    const once = withSummary(base, "First.", LEAD, at(5));
    const twice = withSummary(once, "Second.", LEAD, at(9));
    const again = parseCard(serializeCard(twice));
    expect(summaryOf(again)).toEqual({ text: "Second.", at: at(9) });
    expect(again.extraSections.map((s) => s.heading)).toEqual(["Summary", "Risks"]);
  });

  it("is none for a feature without one", () => {
    expect(summaryOf(feature("FEAT-9"))).toBeNull();
    const blank = { ...feature("FEAT-9"), extraSections: [{ heading: "Summary", content: "  " }] };
    expect(summaryOf(blank)).toBeNull();
  });
});

describe("a write_summary call", () => {
  it("takes a feature's id and the summary's text", () => {
    expect(parseSummaryInput({ feature: " feat-9 ", summary: " Done.\r\nAll of it. " })).toEqual({
      ok: true,
      value: { feature: "FEAT-9", summary: "Done.\nAll of it." },
    });
  });

  it("refuses a story, a missing id, an empty summary and one that is too long", () => {
    expect(parseSummaryInput({ feature: "STORY-1", summary: "x" })).toEqual({
      ok: false,
      error: SUMMARY_MESSAGES.badFeature,
    });
    expect(parseSummaryInput({ summary: "x" })).toEqual({ ok: false, error: SUMMARY_MESSAGES.badFeature });
    expect(parseSummaryInput({ feature: "FEAT-9", summary: "  " })).toEqual({
      ok: false,
      error: SUMMARY_MESSAGES.empty,
    });
    expect(parseSummaryInput({ feature: "FEAT-9", summary: "x".repeat(SUMMARY_LIMIT + 1) })).toEqual({
      ok: false,
      error: SUMMARY_MESSAGES.tooLong,
    });
    expect(parseSummaryInput(null)).toEqual({ ok: false, error: SUMMARY_MESSAGES.badFeature });
  });

  it("keeps a heading in the text from ending the card's section", () => {
    const parsed = parseSummaryInput({ feature: "FEAT-9", summary: "Intro\n## Risks\nNone" });
    if (!parsed.ok) throw new Error(parsed.error);
    const card = withSummary(feature("FEAT-9"), parsed.value.summary, LEAD, at(5));
    expect(summaryOf(parseCard(serializeCard(card)))?.text).toBe("Intro\n### Risks\nNone");
  });
});
