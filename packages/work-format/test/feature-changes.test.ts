/**
 * STORY-71: changes asked on a feature, kept as `changes-asked`, `changes-handled` and `changes-dismissed` events in
 * its history and read back from them alone. Real parser, writer and card round trip.
 */
import { describe, expect, it } from "vitest";
import {
  CHANGES_MAX,
  CHANGES_MESSAGES,
  CHANGES_REFUSALS,
  changesMessage,
  changesOf,
  changesOpen,
  checkReason,
  normalizeFeatureChanges,
  normalizeFeatureReview,
  parseCard,
  parseChangesHandledInput,
  recordChangesAsked,
  recordChangesDismissed,
  recordChangesHandled,
  serializeCard,
} from "../src/index.ts";
import { at, feature } from "./fixtures.ts";

const LEAD = "session:chat-1";
const round = (card = feature("FEAT-9")) => parseCard(serializeCard(card));

describe("changes asked on a feature (AC2)", () => {
  it("are logged in its history by the user, and read back after the card is written and read again", () => {
    const card = round(recordChangesAsked(feature("FEAT-9"), "  Rename Save to Keep. ", "user", at(1)));
    expect(card.history.at(-1)).toEqual({
      at: at(1),
      field: "changes-asked",
      from: null,
      to: "Rename Save to Keep.",
      by: "user",
    });
    expect(changesOf(card)).toEqual({ asked: [{ text: "Rename Save to Keep.", at: at(1) }], reply: null });
    expect(changesOpen(card)).toBe(true);
  });

  it("are none on a feature nobody asked changes of", () => {
    expect(changesOf(feature("FEAT-9"))).toBeNull();
    expect(changesOpen(feature("FEAT-9"))).toBe(false);
  });

  it("collect every reason asked again before the Dev Lead replies, oldest first", () => {
    const once = recordChangesAsked(feature("FEAT-9"), "First.", "user", at(1));
    const twice = round(recordChangesAsked(once, "Second.", "user", at(2)));
    expect(changesOf(twice)?.asked.map((n) => n.text)).toEqual(["First.", "Second."]);
  });
});

describe("the Dev Lead marking them handled (AC3)", () => {
  const asked = recordChangesAsked(feature("FEAT-9"), "Rename Save to Keep.", "user", at(1));

  it("records its reply by its session and ends the round: the reply shows and Changes asked clears", () => {
    const card = round(recordChangesHandled(asked, " Renamed it. ", LEAD, at(2)));
    expect(card.history.at(-1)).toEqual({
      at: at(2),
      field: "changes-handled",
      from: null,
      to: "Renamed it.",
      by: LEAD,
    });
    expect(changesOf(card)).toEqual({
      asked: [{ text: "Rename Save to Keep.", at: at(1) }],
      reply: { text: "Renamed it.", at: at(2) },
    });
    expect(changesOpen(card)).toBe(false);
  });

  it("starts a new round when the user asks again after the reply", () => {
    const handled = recordChangesHandled(asked, "Renamed it.", LEAD, at(2));
    const again = round(recordChangesAsked(handled, "Now the Cancel button.", "user", at(3)));
    expect(changesOf(again)).toEqual({ asked: [{ text: "Now the Cancel button.", at: at(3) }], reply: null });
  });

  it("counts only the first reply to a round", () => {
    const handled = recordChangesHandled(asked, "Renamed it.", LEAD, at(2));
    const late = recordChangesHandled(handled, "Again.", LEAD, at(3));
    expect(changesOf(late)?.reply).toEqual({ text: "Renamed it.", at: at(2) });
  });
});

describe("the user dismissing them (AC4)", () => {
  it("is logged by the user and clears Changes asked", () => {
    const asked = recordChangesAsked(feature("FEAT-9"), "Rename Save to Keep.", "user", at(1));
    const card = round(recordChangesDismissed(asked, "user", at(2)));
    expect(card.history.at(-1)).toEqual({ at: at(2), field: "changes-dismissed", from: null, to: null, by: "user" });
    expect(changesOf(card)).toBeNull();
  });

  it("leaves a reply that comes after it uncounted", () => {
    const asked = recordChangesAsked(feature("FEAT-9"), "Rename Save to Keep.", "user", at(1));
    const late = recordChangesHandled(recordChangesDismissed(asked, "user", at(2)), "Renamed it.", LEAD, at(3));
    expect(changesOf(late)).toBeNull();
  });
});

describe("the reason (AC1)", () => {
  it("is required and has a limit", () => {
    expect(checkReason("  ")).toBe(CHANGES_REFUSALS.noReason);
    expect(checkReason("x".repeat(CHANGES_MAX + 1))).toBe(CHANGES_REFUSALS.tooLong);
    expect(checkReason("Rename it.")).toBeNull();
  });

  it("reaches the Dev Lead's chat naming the feature", () => {
    expect(changesMessage("FEAT-9", " Rename it. ")).toBe("Changes asked on FEAT-9: Rename it.");
  });

  it("keeps its line breaks as plain newlines, as the reply does, and counts them so", () => {
    const crlf = "Rename Save.\r\nThen Cancel.";
    expect(changesMessage("FEAT-9", crlf)).toBe("Changes asked on FEAT-9: Rename Save.\nThen Cancel.");
    expect(recordChangesAsked(feature("FEAT-9"), crlf, "user", at(1)).history.at(-1)?.to).toBe(
      "Rename Save.\nThen Cancel.",
    );
    expect(checkReason(`${"x".repeat(CHANGES_MAX - 2)}\r\ny`)).toBeNull();
  });

  it("says its limit as the reply's does", () => {
    expect(CHANGES_REFUSALS.tooLong).toBe("Keep it under 2,000 characters.");
    expect(CHANGES_MESSAGES.tooLong).toBe("Keep the reply under 2,000 characters.");
  });
});

describe("a mark_changes_handled call (AC3)", () => {
  it("takes a feature's id and the reply", () => {
    expect(parseChangesHandledInput({ feature: " feat-9 ", reply: " Renamed.\r\nAll of them. " })).toEqual({
      ok: true,
      value: { feature: "FEAT-9", reply: "Renamed.\nAll of them." },
    });
  });

  it("says what to fix", () => {
    expect(parseChangesHandledInput({ feature: "STORY-9", reply: "x" })).toEqual({
      ok: false,
      error: CHANGES_MESSAGES.badFeature,
    });
    expect(parseChangesHandledInput({ feature: "FEAT-9", reply: " " })).toEqual({
      ok: false,
      error: CHANGES_MESSAGES.empty,
    });
    expect(parseChangesHandledInput({ feature: "FEAT-9", reply: "x".repeat(CHANGES_MAX + 1) })).toEqual({
      ok: false,
      error: CHANGES_MESSAGES.tooLong,
    });
    expect(parseChangesHandledInput(null)).toEqual({ ok: false, error: CHANGES_MESSAGES.badFeature });
  });
});

describe("the changes as the client reads them", () => {
  it("keep sound notes and drop the rest", () => {
    expect(
      normalizeFeatureChanges({
        asked: [{ text: "Rename it.", at: at(1) }, { text: " ", at: at(2) }, 7],
        reply: { text: "Done.", at: 3 },
      }),
    ).toEqual({ asked: [{ text: "Rename it.", at: at(1) }], reply: null });
    expect(normalizeFeatureChanges({ asked: [] })).toBeNull();
    expect(normalizeFeatureChanges(null)).toBeNull();
  });

  it("ride on the review", () => {
    const view = { id: "FEAT-9", type: "feature", title: "x", status: "active", owner: "main" };
    const changes = { asked: [{ text: "Rename it.", at: at(1) }], reply: null };
    expect(normalizeFeatureReview({ feature: view, changes })?.changes).toEqual(changes);
  });
});
