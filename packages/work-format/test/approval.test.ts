/**
 * STORY-70: the review screen's Approve. Which step it is at (Approve, Merge to main after a failed merge, Merged), and
 * the first reason that stops it, in ADR 0037's order: unfinished stories, then the merge's own reasons. The rules run
 * for real over cards built with work-format's own constructors.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  doneFeature,
  FEATURE_END_MESSAGES,
  featureAcceptRefusal,
  featureApprovalOf,
  finishedFeature,
  mergeStateOf,
  normalizeFeatureApproval,
  setStatus,
  withFeatureAccepted,
  type Card,
  type FeatureMergeFacts,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

const ID = "FEAT-1";
const done = (id: string) => moves(story(id, ID), [1, "In Progress"], [2, "Done"]);
const doing = (id: string) => moves(story(id, ID), [1, "In Progress"]);
const facts = (over: Partial<FeatureMergeFacts> = {}): FeatureMergeFacts => ({
  base: "main",
  branch: "feature/1-ship",
  behind: false,
  conflicts: false,
  pr: "open",
  remoteAhead: false,
  baseBusy: false,
  checks: "passed",
  ...over,
});
const m = FEATURE_END_MESSAGES;
const ready = () => [feature(ID), done("STORY-1")];
/** The feature is the first card. */
const approvalOf = (cards: Card[] = ready(), over?: Partial<FeatureMergeFacts>) =>
  featureApprovalOf(cards[0] as Card, cards, config, over === undefined ? undefined : mergeStateOf(facts(over)));

describe("Approve (AC1, AC2)", () => {
  it("is on once every story is finished and nothing stops the merge", () => {
    expect(approvalOf(ready(), {})).toEqual({ step: "approve", ready: true, reason: null, base: "main" });
  });

  it("waits with a reason before the server's first read of the merge", () => {
    expect(approvalOf()).toEqual({ step: "approve", ready: false, reason: m.checking, base: "main" });
  });

  it("names unfinished stories first, before any reason the merge has", () => {
    const cards = [...ready(), doing("STORY-2")];
    const unfinished = featureAcceptRefusal(cards[0], ID, cards, config);
    expect(unfinished).toBe(m.unfinished(ID, 1));
    expect(approvalOf(cards, { conflicts: true, behind: true, checks: "failed" })).toEqual({
      step: "approve",
      ready: false,
      reason: unfinished,
      base: "main",
    });
    expect(approvalOf(cards)?.reason).toBe(unfinished);
  });

  // Each reason the merge has, with every later one also true: the first in ADR 0037's order is the one shown. The PR
  // has one state, so the earlier reason's wins (assigned last).
  const order: [string, Partial<FeatureMergeFacts>, string][] = [
    ["conflicts", { conflicts: true }, m.conflicts("main")],
    ["behind", { behind: true }, m.behind("main")],
    ["no PR", { pr: "none" }, m.noPr],
    ["PR closed", { pr: "closed" }, m.prClosed],
    ["remote ahead", { remoteAhead: true }, m.remoteAhead("feature/1-ship")],
    ["base busy", { baseBusy: true }, m.baseBusy("main")],
    ["checks running", { checks: "running" }, m.running],
  ];
  for (const [i, [name, , reason]] of order.entries()) {
    it(`is off with "${name}" ahead of every reason after it`, () => {
      const all = Object.assign(
        {},
        ...order
          .slice(i)
          .toReversed()
          .map(([, f]) => f),
      ) as Partial<FeatureMergeFacts>;
      expect(approvalOf(ready(), all)).toEqual({ step: "approve", ready: false, reason, base: "main" });
    });
  }

  it("is off with the checks' own reason when they failed, wait or have no command", () => {
    expect(approvalOf(ready(), { checks: "failed" })?.reason).toBe(m.failed);
    expect(approvalOf(ready(), { checks: "pending" })?.reason).toBe(m.pending);
    expect(approvalOf(ready(), { checks: "no-command" })?.reason).toBe(m.noCommand);
  });

  it("names the project's base branch", () => {
    const develop = { ...config, baseBranch: "develop" };
    const cards = ready();
    expect(featureApprovalOf(cards[0] as Card, cards, develop, mergeStateOf(facts({ base: "develop" })))?.base).toBe(
      "develop",
    );
  });

  it("isn't there for a feature not started, nor for anything but a feature", () => {
    const approved = setStatus(feature(ID), "approved", "user", at(1));
    expect(featureApprovalOf(approved, [approved], config, undefined)).toBeNull();
    const s = done("STORY-1");
    expect(featureApprovalOf(s, [s], config, undefined)).toBeNull();
  });
});

const accepted = () => [withFeatureAccepted(feature(ID), "user", at(5)), done("STORY-1")];

describe("Merge to main, the retry after a failed merge (AC4)", () => {
  it("is the step once accepted, on when nothing stops the merge", () => {
    expect(approvalOf(accepted(), {})).toEqual({ step: "merge", ready: true, reason: null, base: "main" });
  });

  it("is off with the merge's reason, or waits before the first read", () => {
    expect(approvalOf(accepted(), { behind: true })).toEqual({
      step: "merge",
      ready: false,
      reason: m.behind("main"),
      base: "main",
    });
    expect(approvalOf(accepted())?.reason).toBe(m.checking);
  });
});

describe("Merged (AC5)", () => {
  it("is the step once the feature merged and is Done, with nothing to press", () => {
    const merged = doneFeature(
      withFeatureAccepted(feature(ID), "user", at(5)),
      "feature/1-ship",
      "main",
      null,
      "system",
      at(6),
    );
    expect(featureApprovalOf(merged, [merged], config, undefined)).toEqual({
      step: "merged",
      ready: false,
      reason: null,
      base: "main",
    });
  });
});

describe("a finished feature: the server reads its merge before Approve", () => {
  it("is one in progress that is accepted, or whose stories are all finished", () => {
    expect(finishedFeature(feature(ID), ready(), DEFAULT_CONFIG)).toBe(true);
    const unfinished = [feature(ID), doing("STORY-2")];
    expect(finishedFeature(unfinished[0] as Card, unfinished, DEFAULT_CONFIG)).toBe(false);
    const yes = withFeatureAccepted(feature(ID), "user", at(5));
    expect(finishedFeature(yes, [yes, doing("STORY-2")], DEFAULT_CONFIG)).toBe(true);
  });
});

describe("normalizeFeatureApproval: the approval as the client takes it off the wire", () => {
  it("keeps a well-formed one", () => {
    const ok = { step: "approve", ready: true, reason: null, base: "main" };
    expect(normalizeFeatureApproval(ok)).toEqual(ok);
  });

  it("is null for anything but a known step", () => {
    expect(normalizeFeatureApproval(null)).toBeNull();
    expect(normalizeFeatureApproval({ step: "ship" })).toBeNull();
  });

  it("is never on with a reason, and defaults the base to main", () => {
    expect(normalizeFeatureApproval({ step: "approve", ready: true, reason: "Checking…" })).toEqual({
      step: "approve",
      ready: false,
      reason: "Checking…",
      base: "main",
    });
  });
});
