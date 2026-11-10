/** STORY-52: the pure rules of Start: the branch name, who may start what, and what the started card says. */
import { describe, expect, it } from "vitest";
import {
  buildCardView,
  existingBranchOf,
  featureBranchName,
  featureIdOfBranch,
  newCard,
  normalizeCardView,
  notStartableReason,
  parseAgentRequest,
  parseStartInput,
  setStatus,
  startedFeature,
  starter,
  startMessage,
  MAIN,
  type Card,
  type OwnedCard,
} from "../src/index.ts";
import { at, config, feature, story } from "./fixtures.ts";

const approved = (id = "FEAT-5", title = "Delegation"): Card =>
  setStatus(
    newCard({ id, type: "feature", title, status: "draft", parent: null }, "user", at(1)),
    "approved",
    "user",
    at(2),
  );

describe("the branch name", () => {
  it("is feature/<N>-<slug of the title>, the convention the ownership rules read", () => {
    expect(featureBranchName({ id: "FEAT-5", title: "Delegation" })).toBe("feature/5-delegation");
    expect(featureBranchName({ id: "FEAT-12", title: "  Start a Feature: now!  " })).toBe(
      "feature/12-start-a-feature-now",
    );
    for (const title of ["Delegation", "Shaping & more", "Über 2"]) {
      expect(featureIdOfBranch(featureBranchName({ id: "FEAT-5", title }))).toBe("FEAT-5");
    }
  });

  it("is feature/<N> when the title has no letters or digits, and a long title is cut at a word edge", () => {
    expect(featureBranchName({ id: "FEAT-7", title: "!!!" })).toBe("feature/7");
    const long = featureBranchName({ id: "FEAT-7", title: `${"word ".repeat(30)}end` });
    expect(long.length).toBeLessThanOrEqual("feature/7-".length + 48);
    expect(long.endsWith("-")).toBe(false);
  });
});

describe("what can be started", () => {
  it("an approved feature", () => {
    expect(notStartableReason(approved(), "FEAT-5")).toBeNull();
  });

  it("says why not for every other card", () => {
    expect(notStartableReason(undefined, "FEAT-5")).toBe("That card is gone.");
    expect(notStartableReason(story("STORY-1", "FEAT-5"), "STORY-1")).toBe("STORY-1 isn't a feature.");
    expect(notStartableReason(feature("FEAT-5", "draft"), "FEAT-5")).toBe(
      "FEAT-5 isn't approved yet. Approve it first.",
    );
    for (const status of ["active", "done", "cancelled"]) {
      expect(notStartableReason(feature("FEAT-5", status), "FEAT-5")).toBe(`FEAT-5 is already ${status}.`);
    }
  });

  it("finds a branch that already belongs to the feature, whatever its slug, and not a neighbour's", () => {
    expect(existingBranchOf("FEAT-5", ["main", "feature/5-old-name", "story-5"])).toBe("feature/5-old-name");
    expect(existingBranchOf("FEAT-5", ["main", "feature/51-other", "feature/4-shaping"])).toBeNull();
  });
});

describe("what Start writes", () => {
  it("makes the feature active with one status event by whoever started it", () => {
    const before = approved();
    const user = startedFeature(before, starter(null), at(9));
    expect(user.status).toBe("active");
    expect(user.history.slice(before.history.length)).toEqual([
      { at: at(9), field: "status", from: "approved", to: "active", by: "user" },
    ]);
    expect(starter("chat-1")).toBe("session:chat-1");
    expect(startedFeature(before, starter("chat-1"), at(9)).history.at(-1)?.by).toBe("session:chat-1");
    expect(before.status).toBe("approved");
  });

  it("names the commit after the feature and its title on one line", () => {
    expect(startMessage({ id: "FEAT-5", title: "Dele\n  gation " })).toBe("FEAT-5: started Dele gation");
  });
});

describe("start_feature's input", () => {
  it("takes a feature id, in any case and with spaces around it", () => {
    expect(parseStartInput({ feature: " feat-5 " })).toEqual({ ok: true, id: "FEAT-5" });
  });

  it("refuses anything else, telling the agent the form", () => {
    for (const input of [
      undefined,
      null,
      {},
      { feature: 5 },
      { feature: "STORY-1" },
      { feature: "FEAT-" },
      { id: "FEAT-5" },
    ]) {
      expect(parseStartInput(input)).toEqual({
        ok: false,
        error: "Give the feature's id, such as FEAT-5, as `feature`.",
      });
    }
  });

  it("is a method the agent socket answers", () => {
    expect(
      parseAgentRequest(JSON.stringify({ id: 3, method: "feature.start", params: { feature: "FEAT-5" } })),
    ).toEqual({
      id: 3,
      method: "feature.start",
      params: { feature: "FEAT-5" },
    });
  });
});

const view = (card: Card) => {
  const owned: OwnedCard = { card, owner: MAIN, shownFrom: MAIN, path: `.featra/cards/${card.id}.md` };
  return buildCardView(owned, true, { config, cards: [card] });
};

describe("the card pane's Start flag", () => {
  it("is set on an approved feature and nowhere else", () => {
    expect(view(approved()).startable).toBe(true);
    expect(view(feature("FEAT-5", "draft")).startable).toBeUndefined();
    expect(view(feature("FEAT-5", "active")).startable).toBeUndefined();
    expect(view(story("STORY-1", "FEAT-5")).startable).toBeUndefined();
  });

  it("crosses the socket", () => {
    expect(normalizeCardView(JSON.parse(JSON.stringify(view(approved()))))?.startable).toBe(true);
    expect(normalizeCardView(JSON.parse(JSON.stringify(view(story("STORY-1", "FEAT-5")))))?.startable).toBeUndefined();
  });
});
