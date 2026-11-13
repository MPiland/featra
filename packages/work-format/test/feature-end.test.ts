/**
 * STORY-14: accepting a feature and merging it to main. The rules over its card, run for real; only the card data is
 * built here (fixtures.ts calls work-format's own constructors).
 */
import { describe, expect, it } from "vitest";
import {
  acceptedFeature,
  behindMessage,
  FEATURE_END_COPY,
  NAMED_FILES,
  buildCardView,
  buildWorkList,
  checksSetParams,
  ConfigError,
  DEFAULT_CONFIG,
  doneFeature,
  evidenceState,
  FEATURE_END_MESSAGES,
  featureAcceptRefusal,
  featureEndOf,
  featureMergeBlock,
  MAIN,
  mergeStateOf,
  normalizeCardView,
  normalizeChecksView,
  normalizeWorkList,
  parseCard,
  parseConfig,
  serializeCard,
  setConfigValue,
  setStatus,
  withFeatureAccepted,
  type Card,
  type FeatureMergeFacts,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

const ID = "FEAT-1";
const PR = "https://github.com/acme/app/pull/7";
const done = (id: string) => moves(story(id, ID), [1, "In Progress"], [2, "Done"]);
const accepted = (card = feature(ID)) => withFeatureAccepted(card, "user", at(5));
const owned = (card: Card) => ({ card, owner: MAIN, shownFrom: MAIN, path: `${card.id}.md` });
const facts = (over: Partial<FeatureMergeFacts> = {}): FeatureMergeFacts => ({
  base: "main",
  branch: "feature/1-ship",
  behind: false,
  conflicts: false,
  pr: null,
  remoteAhead: false,
  baseBusy: false,
  checks: "passed",
  ...over,
});

describe("Accept on a feature (AC1)", () => {
  it("applies once every story and bug under it is Done or Cancelled", () => {
    const cards = [feature(ID), done("STORY-1"), moves(story("STORY-2", ID), [1, "Cancelled"])];
    expect(featureAcceptRefusal(cards[0], ID, cards, config)).toBeNull();
  });

  it("counts a bug under the feature like a story", () => {
    const bug = story("BUG-1", ID, { type: "bug", status: "In Progress" });
    const cards = [feature(ID), done("STORY-1"), bug];
    expect(featureAcceptRefusal(cards[0], ID, cards, config)).toBe(FEATURE_END_MESSAGES.unfinished(ID, 1));
  });

  it("is refused while items are unfinished, counting them, and ignores other features' stories", () => {
    const cards = [
      feature(ID),
      done("STORY-1"),
      story("STORY-2", ID),
      story("STORY-3", ID, { status: "In Review" }),
      story("STORY-9", "FEAT-2"),
    ];
    expect(featureAcceptRefusal(cards[0], ID, cards, config)).toBe(FEATURE_END_MESSAGES.unfinished(ID, 2));
  });

  it("is refused with nothing done, gone, not a feature, not in progress, or accepted already", () => {
    const cancelled = [feature(ID), moves(story("STORY-1", ID), [1, "Cancelled"])];
    expect(featureAcceptRefusal(cancelled[0], ID, cancelled, config)).toBe(FEATURE_END_MESSAGES.empty(ID));
    expect(featureAcceptRefusal(undefined, ID, [], config)).toBe(FEATURE_END_MESSAGES.gone);
    const s = done("STORY-1");
    expect(featureAcceptRefusal(s, "STORY-1", [s], config)).toBe(FEATURE_END_MESSAGES.notFeature("STORY-1"));
    const planned = feature(ID, "planned");
    expect(featureAcceptRefusal(planned, ID, [planned, done("STORY-1")], config)).toBe(
      FEATURE_END_MESSAGES.notActive(ID),
    );
    const twice = accepted();
    expect(featureAcceptRefusal(twice, ID, [twice, done("STORY-1")], config)).toBe(FEATURE_END_MESSAGES.accepted(ID));
  });

  it("is recorded once, as the user's, in the card's history", () => {
    const card = accepted();
    expect(evidenceState(card).accepted).toBe(true);
    expect(acceptedFeature(card)).toBe(true);
    expect(card.history.at(-1)).toMatchObject({ field: "accepted", by: "user", at: at(5) });
    expect(withFeatureAccepted(card, "user", at(9))).toBe(card);
    expect(acceptedFeature(feature(ID))).toBe(false);
    expect(acceptedFeature(setStatus(card, "done", "system", at(9)))).toBe(false);
  });
});

/** FEAT-1's Work row as it crosses the socket. */
const rowOf = (cards: Card[]) => {
  const list = buildWorkList({ cards: cards.map(owned), stale: [], problems: [] }, config);
  return normalizeWorkList(JSON.parse(JSON.stringify(list)))
    .epics.flatMap((e) => e.features)
    .find((f) => f.id === ID);
};

describe("the feature's Work row (AC1)", () => {
  it("opens the feature's card once Accept applies to it, and while it is accepted", () => {
    expect(rowOf([feature(ID), done("STORY-1")])?.ending).toBe(true);
    expect(rowOf([accepted(), done("STORY-1")])?.ending).toBe(true);
  });

  it("doesn't while a story is unfinished, before any is done, or once the feature is Done", () => {
    expect(rowOf([feature(ID), done("STORY-1"), story("STORY-2", ID)])?.ending).toBeUndefined();
    expect(rowOf([feature(ID)])?.ending).toBeUndefined();
    const merged = doneFeature(accepted(), "feature/1-ship", "main", null, "system", at(9));
    expect(rowOf([merged, done("STORY-1")])?.ending).toBeUndefined();
  });
});

describe("the feature's PR on its card (AC2)", () => {
  it("is written to the card once it has one, and read back", () => {
    const card = { ...accepted(), pr: PR };
    expect(parseCard(serializeCard(card)).pr).toBe(PR);
  });

  it("isn't written while it has none, so other features read as before", () => {
    expect(serializeCard(feature(ID))).not.toMatch(/^pr:/m);
  });

  it("opens automatically by default; the setting is checked in config and across the socket", () => {
    expect(DEFAULT_CONFIG.openFeaturePrs).toBe(true);
    expect(parseConfig("version: 1\nopenFeaturePrs: false\n").openFeaturePrs).toBe(false);
    expect(() => parseConfig("version: 1\nopenFeaturePrs: later\n")).toThrow(ConfigError);
    expect(setConfigValue("version: 1\n", "openFeaturePrs", false)).toContain("openFeaturePrs: false");
    expect(checksSetParams({ dir: "/p", patch: { openFeaturePrs: false } })).toEqual({
      dir: "/p",
      patch: { openFeaturePrs: false },
    });
    expect(checksSetParams({ dir: "/p", patch: { openFeaturePrs: "no" } })).toBeNull();
    expect(normalizeChecksView({}).openFeaturePrs).toBe(true);
    expect(normalizeChecksView({ openFeaturePrs: false }).openFeaturePrs).toBe(false);
  });
});

describe("Merge to main waits (AC3, AC4)", () => {
  it("goes once checks pass on its branch's commit with main in its history", () => {
    expect(featureMergeBlock(facts())).toBeNull();
    expect(mergeStateOf(facts())).toEqual({ mergeable: true, blocked: null });
    expect(featureMergeBlock(facts({ pr: "open" }))).toBeNull();
  });

  it("says why it waits, conflicts and main moving on first, then the PR, then the checks", () => {
    const m = FEATURE_END_MESSAGES;
    const all = facts({ conflicts: true, behind: true, pr: "none", remoteAhead: true, checks: "failed" });
    expect(featureMergeBlock(all)).toBe(m.conflicts("main"));
    expect(featureMergeBlock({ ...all, conflicts: false })).toBe(m.behind("main"));
    expect(featureMergeBlock(facts({ pr: "none", checks: "failed" }))).toBe(m.noPr);
    expect(featureMergeBlock(facts({ pr: "closed" }))).toBe(m.prClosed);
    expect(featureMergeBlock(facts({ remoteAhead: true, checks: "failed" }))).toBe(m.remoteAhead("feature/1-ship"));
    expect(featureMergeBlock(facts({ baseBusy: true, checks: "failed" }))).toBe(m.baseBusy("main"));
    expect(featureMergeBlock(facts({ checks: "failed" }))).toBe(m.failed);
    expect(featureMergeBlock(facts({ checks: "running" }))).toBe(m.running);
    expect(featureMergeBlock(facts({ checks: "pending" }))).toBe(m.pending);
    expect(featureMergeBlock(facts({ checks: "no-command" }))).toBe(m.noCommand);
    expect(mergeStateOf(facts({ checks: "pending" }))).toEqual({ mergeable: false, blocked: m.pending });
  });

  it("says first that its PR merged on GitHub without this computer's latest commits (review B2)", () => {
    const all = facts({ pr: "merged", conflicts: true, behind: true, baseBusy: true, checks: "failed" });
    expect(featureMergeBlock(all)).toBe(FEATURE_END_MESSAGES.prMergedBehind);
  });

  it("tells the Dev Lead to merge main in with a merge commit, never a rebase, naming conflicting files", () => {
    const ask = behindMessage("feature/1-ship", "main", []);
    expect(ask).toBe(
      "main has moved on. Merge main into feature/1-ship with a merge commit, never a rebase, and commit it.",
    );
    expect(behindMessage("feature/1-ship", "main", ["a.ts", "b.ts"])).toBe(`${ask} These files conflict: a.ts, b.ts.`);
  });

  it("names the first few conflicting files, then how many more (review ruling)", () => {
    const ask = behindMessage("feature/1-ship", "main", []);
    const files = Array.from({ length: NAMED_FILES + 2 }, (_, i) => `f${i}.ts`);
    expect(behindMessage("feature/1-ship", "main", files)).toBe(
      `${ask} These files conflict: ${files.slice(0, NAMED_FILES).join(", ")} and 2 more.`,
    );
    const exactly = files.slice(0, NAMED_FILES);
    expect(behindMessage("feature/1-ship", "main", exactly)).toBe(
      `${ask} These files conflict: ${exactly.join(", ")}.`,
    );
  });
});

/** The card pane's view of `card`, with what the server found of its merge. */
const view = (card: Card, cards: Card[], merge?: Parameters<typeof featureEndOf>[3]) =>
  buildCardView(owned(card), true, { config, cards }, undefined, undefined, merge);

describe("the card pane's feature end (AC1, AC3)", () => {
  it("offers Accept once acceptable, and no Merge to main before Accept", () => {
    const open = [feature(ID), story("STORY-1", ID)];
    expect(view(open[0]!, open).featureEnd).toEqual({
      acceptable: false,
      accepted: false,
      mergeable: false,
      blocked: null,
      base: "main",
    });
    const ready = [feature(ID), done("STORY-1")];
    // The server's merge state is ignored until Accept: Merge to main is never on before it.
    const shown = view(ready[0]!, ready, { mergeable: true, blocked: null }).featureEnd;
    expect(shown).toEqual({ acceptable: true, accepted: false, mergeable: false, blocked: null, base: "main" });
  });

  it("shows Merge to main once accepted, on only when the server finds it can merge", () => {
    const card = accepted();
    const cards = [card, done("STORY-1")];
    // Before the server's first read, it waits with a reason (review nit: "Checking…").
    expect(view(card, cards).featureEnd).toEqual({
      acceptable: false,
      accepted: true,
      mergeable: false,
      blocked: FEATURE_END_MESSAGES.checking,
      base: "main",
    });
    const waiting = { mergeable: false, blocked: FEATURE_END_MESSAGES.pending };
    expect(view(card, cards, waiting).featureEnd).toEqual({
      acceptable: false,
      accepted: true,
      ...waiting,
      base: "main",
    });
    expect(view(card, cards, { mergeable: true, blocked: null }).featureEnd?.mergeable).toBe(true);
  });

  it("crosses the socket checked", () => {
    const card = accepted();
    const raw = JSON.parse(JSON.stringify(view(card, [card, done("STORY-1")], { mergeable: true, blocked: null })));
    expect(normalizeCardView(raw)?.featureEnd).toEqual({
      acceptable: false,
      accepted: true,
      mergeable: true,
      blocked: null,
      base: "main",
    });
  });

  it("names the project's base branch, as configured (review nit)", () => {
    const card = accepted();
    const cards = [card, done("STORY-1")];
    const trunk = buildCardView(owned(card), true, { config: { ...config, baseBranch: "trunk" }, cards });
    expect(trunk.featureEnd?.base).toBe("trunk");
    expect(FEATURE_END_COPY.merge("trunk")).toBe("Merge to trunk");
    expect(FEATURE_END_COPY.mergeOf(ID, "trunk")).toBe(`Merge ${ID} to trunk`);
  });

  it("is absent on stories and on a feature that isn't in progress", () => {
    const s = done("STORY-1");
    expect(view(s, [s]).featureEnd).toBeUndefined();
    const planned = feature(ID, "planned");
    expect(view(planned, [planned]).featureEnd).toBeUndefined();
  });
});

describe("after the merge (AC5)", () => {
  it("the feature is Done by the system, with the merge and its PR in its history", () => {
    const card = doneFeature(accepted(), "feature/1-ship", "main", PR, "system", at(9));
    expect(card.status).toBe("done");
    expect(card.pr).toBe(PR);
    expect(card.history.find((e) => e.field === "merged")).toMatchObject({ from: "feature/1-ship", to: "main" });
    expect(card.history.at(-1)).toMatchObject({ field: "status", to: "done", by: "system" });
    expect(featureEndOf(card, [card], config, undefined)).toBeUndefined();
  });

  it("records the merge once, and has no PR in local mode", () => {
    const once = doneFeature(accepted(), "feature/1-ship", "main", null, "system", at(9));
    const again = doneFeature(once, "feature/1-ship", "main", null, "system", at(10));
    expect(again.history.filter((e) => e.field === "merged")).toHaveLength(1);
    expect(once.pr).toBeNull();
  });

  it("a Done feature isn't shown as a story merged into its feature", () => {
    const card = doneFeature(accepted(), "feature/1-ship", "main", null, "system", at(9));
    expect(buildCardView(owned(card), true, { config, cards: [card] }).merged).toBeUndefined();
  });
});
