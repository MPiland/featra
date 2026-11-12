/**
 * STORY-23: accepting a story or sending it back. The rules over a card, run for real; only the card data is built here
 * (fixtures.ts calls work-format's own constructors).
 */
import { describe, expect, it } from "vitest";
import {
  acceptanceRefusal,
  acceptedStory,
  ACCEPT_MESSAGES,
  awaitingAcceptance,
  buildCardView,
  buildWorkList,
  doneStage,
  evidenceState,
  isStopped,
  MAIN,
  normalizeCardView,
  normalizeWorkList,
  parseCard,
  reasonAsCriterion,
  recordEvidence,
  sendBackMessage,
  sentBackStory,
  serializeCard,
  settleDone,
  stoppedStory,
  storySendBackParams,
  type Card,
  type ProjectConfig,
} from "../src/index.ts";
import { at, config, moves, story } from "./fixtures.ts";

const waiting = (): Card => moves(story("STORY-1", "FEAT-1"), [1, "In Progress"], [2, "In Review"], [3, "Acceptance"]);
const verified = (card: Card) => recordEvidence(card, "verified", "system", at(4));
const researcher = (card: Card): Card => ({ ...card, role: "researcher" });
const lenient: ProjectConfig = { ...config, requireAccept: false };

describe("awaiting acceptance (AC1)", () => {
  it("is a story in Acceptance that the user has not accepted", () => {
    expect(awaitingAcceptance(waiting(), config)).toBe(true);
    expect(awaitingAcceptance(acceptedStory(waiting(), config, "user", at(5)), config)).toBe(false);
  });

  it.each(["New", "In Progress", "In Review", "Done"])("is not a story in %s", (stage) => {
    expect(awaitingAcceptance(moves(story("STORY-1", "FEAT-1"), [1, stage]), config)).toBe(false);
  });

  it("is not a bug, or a story in a project with no Acceptance stage", () => {
    const bug = moves(story("BUG-1", "FEAT-1", { type: "bug" }), [1, "Acceptance"]);
    expect(awaitingAcceptance(bug, config)).toBe(false);
    const stages = config.stages.filter((s) => s.name !== "Acceptance");
    expect(awaitingAcceptance(waiting(), { ...config, stages })).toBe(false);
  });

  it("shows on the Work row and the card view, and survives the socket", () => {
    const cards = [waiting(), moves(story("STORY-2", "FEAT-1"), [1, "In Progress"])];
    const owned = cards.map((card) => ({ card, owner: MAIN, shownFrom: MAIN, path: `${card.id}.md` }));
    const rows = buildWorkList({ cards: owned, stale: [], problems: [] }, config).epics.flatMap((e) =>
      e.features.flatMap((f) => f.stories),
    );
    expect(rows.map((r) => [r.id, r.awaiting])).toEqual([
      ["STORY-1", true],
      ["STORY-2", false],
    ]);
    expect(
      normalizeWorkList(JSON.parse(JSON.stringify(buildWorkList({ cards: owned, stale: [], problems: [] }, config)))),
    ).toEqual(buildWorkList({ cards: owned, stale: [], problems: [] }, config));
    const view = (i: number) => buildCardView(owned[i] as (typeof owned)[number], true, { config, cards });
    expect(view(0).awaiting).toBe(true);
    expect(view(1).awaiting).toBeUndefined();
    expect(normalizeCardView(JSON.parse(JSON.stringify(view(0))))?.awaiting).toBe(true);
  });
});

describe("Accept (AC2)", () => {
  it("records Accepted in the card's history, by the user", () => {
    const next = acceptedStory(waiting(), config, "user", at(5));
    expect(next.history.find((e) => e.field === "accepted")).toEqual({
      at: at(5),
      field: "accepted",
      from: null,
      to: "accepted",
      by: "user",
    });
    expect(evidenceState(next).accepted).toBe(true);
  });

  it("leaves an unverified story in Acceptance, since nothing has Verified it", () => {
    const next = acceptedStory(waiting(), config, "user", at(5));
    expect(next.status).toBe("Acceptance");
    expect(next.history.filter((e) => e.field === "status")).toHaveLength(4);
  });

  it("moves a verified story to Done, recording the move by the user", () => {
    const next = acceptedStory(verified(waiting()), config, "user", at(5));
    expect(next.status).toBe("Done");
    expect(next.history.at(-1)).toEqual({ at: at(5), field: "status", from: "Acceptance", to: "Done", by: "user" });
  });

  it("moves a Researcher story to Done on Accept alone, since research has no CI", () => {
    const next = acceptedStory(researcher(waiting()), config, "user", at(5));
    expect(next.status).toBe("Done");
  });

  it("needs Verified alone when the project does not require Accept", () => {
    // requireAccept off: Verified alone gates Done, so an Accept on an unverified story still waits.
    expect(acceptedStory(waiting(), lenient, "user", at(5)).status).toBe("Acceptance");
    expect(acceptedStory(verified(waiting()), lenient, "user", at(5)).status).toBe("Done");
  });

  it("survives a round trip through the card file", () => {
    const next = acceptedStory(verified(waiting()), config, "user", at(5));
    expect(parseCard(serializeCard(next)).history).toEqual(next.history);
  });
});

describe("settling to Done once Verified arrives (AC2, the rule STORY-11 and STORY-56 reuse)", () => {
  it("moves an accepted story the moment it is verified", () => {
    const accepted = acceptedStory(waiting(), config, "user", at(5));
    expect(settleDone(accepted, config, "system", at(6))).toBe(accepted);
    const next = settleDone(verified(accepted), config, "system", at(7));
    expect(next.status).toBe("Done");
    expect(next.history.at(-1)).toMatchObject({ field: "status", to: "Done", by: "system" });
  });

  it("does nothing for a verified story the user has not accepted", () => {
    const card = verified(waiting());
    expect(settleDone(card, config, "system", at(6))).toBe(card);
  });

  it.each(["In Progress", "In Review"])("only moves a story that waits in Acceptance, not one in %s", (stage) => {
    const card = verified(acceptedStory(moves(story("STORY-1", "FEAT-1"), [1, stage]), config, "user", at(5)));
    expect(settleDone(card, config, "system", at(6))).toBe(card);
  });

  it("does nothing for a feature or when the project has no done stage", () => {
    const card = verified(acceptedStory(waiting(), config, "user", at(5)));
    expect(doneStage(config)).toBe("Done");
    expect(settleDone({ ...card, type: "feature" }, config, "system", at(6)).status).toBe("Acceptance");
    const stages = config.stages.filter((s) => s.category !== "done");
    expect(doneStage({ ...config, stages })).toBeNull();
    expect(settleDone(card, { ...config, stages }, "system", at(6))).toBe(card);
  });
});

describe("refusals", () => {
  it("names why Accept and Send back can't be used", () => {
    expect(acceptanceRefusal(waiting(), "STORY-1", config)).toBeNull();
    expect(acceptanceRefusal(undefined, "STORY-1", config)).toBe(ACCEPT_MESSAGES.gone);
    expect(acceptanceRefusal({ ...waiting(), type: "feature" }, "FEAT-1", config)).toBe(
      ACCEPT_MESSAGES.notStory("FEAT-1"),
    );
    expect(acceptanceRefusal(moves(story("STORY-1", "FEAT-1"), [1, "In Progress"]), "STORY-1", config)).toBe(
      ACCEPT_MESSAGES.notWaiting("STORY-1", "In Progress"),
    );
  });

  it("refuses a story that is already accepted, so Send back is gone after Accept (AC4)", () => {
    const accepted = acceptedStory(waiting(), config, "user", at(5));
    expect(acceptanceRefusal(accepted, "STORY-1", config)).toBe(ACCEPT_MESSAGES.accepted("STORY-1"));
  });
});

describe("Send back (AC3)", () => {
  const reason = "  It loses the draft\nwhen I close the pane.  ";

  it("returns the story to In Progress and logs the reason as written, by the user", () => {
    const next = sentBackStory(waiting(), reason, false, "user", at(5));
    expect(next.status).toBe("In Progress");
    const events = next.history.slice(-2);
    expect(events[0]).toEqual({
      at: at(5),
      field: "sent-back",
      from: null,
      to: "It loses the draft\nwhen I close the pane.",
      by: "user",
    });
    expect(events[1]).toEqual({ at: at(5), field: "status", from: "Acceptance", to: "In Progress", by: "user" });
    expect(next.acs).toEqual(waiting().acs);
  });

  it("adds the reason as a new, unchecked acceptance criterion on one line, with a content event, when asked", () => {
    const base = { ...waiting(), acs: [{ text: "It opens", done: true, test: "a > b" }] };
    const next = sentBackStory(base, reason, true, "user", at(5));
    expect(next.acs).toEqual([
      { text: "It opens", done: true, test: "a > b" },
      { text: "It loses the draft when I close the pane.", done: false, test: null },
    ]);
    expect(next.history.at(-1)).toEqual({
      at: at(5),
      field: "content",
      from: JSON.stringify({ criteria: ["It opens"] }),
      to: "criteria",
      by: "user",
    });
    expect(parseCard(serializeCard(next)).acs.at(-1)?.text).toBe("It loses the draft when I close the pane.");
  });

  it("clears a Stopped mark, since the user is directing the session again", () => {
    const stopped = stoppedStory(waiting(), "user", at(4));
    expect(isStopped(stopped)).toBe(true);
    expect(isStopped(sentBackStory(stopped, "Fix it.", false, "user", at(5)))).toBe(false);
  });

  it("leaves the history before it untouched", () => {
    const before = waiting();
    expect(sentBackStory(before, "Fix it.", true, "user", at(5)).history.slice(0, before.history.length)).toEqual(
      before.history,
    );
  });

  it("reads a criterion as one line", () => {
    expect(reasonAsCriterion("  a\n\n b\t c ")).toBe("a b c");
  });

  it("is told to the session as a short message naming the story", () => {
    expect(sendBackMessage("STORY-1", "  Too slow. ")).toBe("Sent back STORY-1: Too slow.");
  });

  it("reads the request off the socket, with the criterion off unless asked", () => {
    expect(storySendBackParams({ dir: "d", id: "STORY-1", reason: "x" })).toEqual({
      dir: "d",
      id: "STORY-1",
      reason: "x",
      addCriterion: false,
    });
    expect(storySendBackParams({ dir: "d", id: "STORY-1", reason: "x", addCriterion: true })?.addCriterion).toBe(true);
    expect(storySendBackParams({ dir: "d", id: "STORY-1" })).toBeNull();
  });
});
