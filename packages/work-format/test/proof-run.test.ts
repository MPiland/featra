/**
 * STORY-69 AC3/AC4: the run that proved a criterion is kept with its proof in the card's history (a CI run's link, or
 * a local run), and the card view shows it only beside the proof it made. Real evidence writer, history and view.
 */
import { describe, expect, it } from "vitest";
import {
  buildCardView,
  ciRunUrl,
  LOCAL_RUN,
  normalizeCardView,
  parseCard,
  provenRuns,
  provingRuns,
  serializeCard,
  withCheckEvidence,
  type Card,
  type OwnedCard,
} from "../src/index.ts";
import { at, config, feature, story } from "./fixtures.ts";

const A = "packages/app/test/a.test.ts";
const card: Card = {
  ...story("STORY-1", "FEAT-1", { status: "In Review" }),
  acs: [
    { text: "Opens", done: false, test: `${A}::a > opens` },
    { text: "Saves", done: false, test: `${A}::a > saves` },
    { text: "Looks right", done: false, test: null },
  ],
};
const RUN_11 = "https://github.com/acme/app/actions/runs/11";
const RUN_12 = "https://github.com/acme/app/actions/runs/12";
const HEAD = "a".repeat(40);
const NEXT = "b".repeat(40);

const prove = (c: Card, acs: { ac: number; passed: boolean; run?: string }[], head = HEAD, minute = 5) =>
  withCheckEvidence(c, config, { passed: null, acs, head }, "system", at(minute));

const viewOf = (c: Card) => {
  const where = { kind: "worktree" as const, branch: "story-1", path: "/w/story-1" };
  const owned: OwnedCard = { card: c, owner: where, shownFrom: where, path: ".featra/cards/STORY-1.md" };
  return buildCardView(owned, true, { config, cards: [feature("FEAT-1"), c] });
};

describe("the proving run kept with the proof (AC4)", () => {
  it("records each proof's run right after it, by the same writer: a CI run's link or a local run", () => {
    const next = prove(card, [
      { ac: 1, passed: true, run: RUN_11 },
      { ac: 2, passed: true, run: LOCAL_RUN },
    ]);
    expect(next.history.slice(-4).map((e) => [e.field, e.to, e.by])).toEqual([
      ["evidence", `proven:1@${HEAD}`, "system"],
      ["evidence", `ran:1@${RUN_11}`, "system"],
      ["evidence", `proven:2@${HEAD}`, "system"],
      ["evidence", "ran:2@local", "system"],
    ]);
    expect([...provenRuns(next)]).toEqual([
      [1, RUN_11],
      [2, LOCAL_RUN],
    ]);
  });

  it("survives writing the card and reading it back, as after a restart", () => {
    const next = prove(card, [{ ac: 1, passed: true, run: RUN_11 }]);
    const again = parseCard(serializeCard(next));
    expect(provenRuns(again).get(1)).toBe(RUN_11);
    expect(viewOf(again).acs[0]).toEqual(expect.objectContaining({ proof: "passed", run: RUN_11 }));
  });

  it("adds nothing when the criterion is already proven at that commit", () => {
    const once = prove(card, [{ ac: 1, passed: true, run: RUN_11 }]);
    expect(prove(once, [{ ac: 1, passed: true, run: RUN_12 }], HEAD, 9)).toBe(once);
    expect(provenRuns(once).get(1)).toBe(RUN_11);
  });

  it("forgets the run when the criterion is proven again without one, or stops being proven", () => {
    const once = prove(card, [
      { ac: 1, passed: true, run: RUN_11 },
      { ac: 2, passed: true, run: RUN_11 },
    ]);
    const again = prove(
      once,
      [
        { ac: 1, passed: true },
        { ac: 2, passed: false },
      ],
      NEXT,
      9,
    );
    expect([...provenRuns(again)]).toEqual([]);
    const later = prove(again, [{ ac: 2, passed: true, run: RUN_12 }], NEXT, 12);
    expect([...provenRuns(later)]).toEqual([[2, RUN_12]]);
  });

  it("never records or reads a run that isn't a link or a local run, nor one for a criterion not proven", () => {
    const odd = prove(card, [{ ac: 1, passed: true, run: "javascript:alert(1)" }]);
    expect(odd.history.some((e) => e.to?.startsWith("ran:"))).toBe(false);
    const forged: Card = {
      ...card,
      history: [
        ...card.history,
        { at: at(6), field: "evidence", from: null, to: "ran:1@http://example.com", by: "system" },
        { at: at(7), field: "evidence", from: null, to: `ran:2@${RUN_11}`, by: "system" },
      ],
    };
    expect([...provenRuns(forged)]).toEqual([]);
  });
});

describe("the card view's run beside each criterion (AC3)", () => {
  it("shows the run only beside a passed criterion, and carries it across the socket", () => {
    const next = prove(card, [
      { ac: 1, passed: true, run: RUN_11 },
      { ac: 2, passed: true, run: LOCAL_RUN },
    ]);
    const view = viewOf(next);
    expect(view.acs.map((ac) => [ac.proof, ac.run])).toEqual([
      ["passed", RUN_11],
      ["passed", LOCAL_RUN],
      ["none", undefined],
    ]);
    expect(normalizeCardView(JSON.parse(JSON.stringify(view)))?.acs).toEqual(view.acs);
    expect(normalizeCardView({ ...view, acs: [{ ...view.acs[0], run: "file:///x" }] })?.acs[0]).not.toHaveProperty(
      "run",
    );
  });

  it("has no run for a proof recorded before runs were kept", () => {
    const old = prove(card, [{ ac: 1, passed: true }]);
    expect(viewOf(old).acs[0]).toEqual({ text: "Opens", done: false, test: `${A}::a > opens`, proof: "passed" });
  });
});

// As a report gives them: names already read as full names.
const cases = (opens: "passed" | "failed" | "skipped", saves: "passed" | "failed" | "skipped") => [
  { classname: A, name: "a opens", status: opens },
  { classname: A, name: "a saves", status: saves },
];

describe("which CI run proved a criterion", () => {
  it("is the first run whose own report passes every test the criterion links, else the first run with a report", () => {
    const runs = [
      { run: 10, cases: [] },
      { run: 11, cases: cases("passed", "skipped") },
      { run: 12, cases: cases("passed", "passed") },
    ];
    expect([...provingRuns(card, runs, [1, 2])]).toEqual([
      [1, 11],
      [2, 12],
    ]);
    const split = { ...card, acs: [{ text: "Both", done: false, test: `${A}::a > opens; ${A}::a > saves` }] };
    const halves = [
      { run: 21, cases: [cases("passed", "passed")[0]!] },
      { run: 22, cases: [cases("passed", "passed")[1]!] },
    ];
    expect([...provingRuns(split, halves, [1])]).toEqual([[1, 21]]);
    expect([...provingRuns(card, [], [1])]).toEqual([]);
  });

  it("links to the run's page in the PR's repository, and to nothing for a PR that isn't on GitHub", () => {
    expect(ciRunUrl("https://github.com/acme/app/pull/7", 11)).toBe(RUN_11);
    expect(ciRunUrl("https://gitlab.com/acme/app/pull/7", 11)).toBeNull();
    expect(ciRunUrl(null, 11)).toBeNull();
    expect(ciRunUrl("https://github.com/acme/app/pull/7", 0)).toBeNull();
  });
});
