/**
 * STORY-16: a feature's burn-up as its progress pane draws it. The series comes from the cards' history (`burnUp`),
 * the row carries it from the scope baseline (`buildWorkList`), and the chart reads it at the end of each local day and
 * ends at the row's own count (`burnUpDays`). The time zone is the platform's, so the tests set it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkList,
  burnUp,
  burnUpDays,
  burnUpText,
  MAIN,
  normalizeWorkList,
  recorded,
  type Card,
  type OwnedCard,
} from "../src/index.ts";
import { at, config, feature, moves, reparent, story } from "./fixtures.ts";

const tasksMode = { ...config, progress: "tasks" as const };
const owned = (card: Card): OwnedCard => ({ card, owner: MAIN, shownFrom: MAIN, path: `.featra/cards/${card.id}.md` });
const list = (cards: Card[], cfg = config) => buildWorkList({ cards: cards.map(owned), stale: [], problems: [] }, cfg);
const rowOf = (cards: Card[], cfg = config) => list(cards, cfg).epics[0]?.features.find((f) => f.id === "FEAT-1");
/** A feature row's burn-up as the client reads it off the socket. */
const read = (sentAs: unknown) =>
  normalizeWorkList({ epics: [{ features: [{ id: "FEAT-1", burnUp: sentAs }] }] }).epics[0]?.features[0]?.burnUp;

/** FEAT-1, approved at 0 and started (in progress) at 10. */
const started = () => moves(feature("FEAT-1", "approved"), [10, "active"]);
const withTasks = (card: Card, ticked: number, total: number): Card => ({
  ...card,
  tasks: Array.from({ length: total }, (_, i) => ({ text: `t${i}`, done: i < ticked })),
});
/** The card with a task added, recorded as the card pane records a task edit. */
const taskAdded = (card: Card, minutes: number): Card =>
  recorded(card, { ...card, tasks: [...card.tasks, { text: "more", done: false }] }, "task", "user", at(minutes));

// Tokyo has no daylight saving: its midnights are 15:00 UTC. at(0) is Nov 1, 09:00 there.
const MIDNIGHT_NOV_2 = 900;
const MIDNIGHT_NOV_3 = 2340;

beforeEach(() => vi.stubEnv("TZ", "Asia/Tokyo"));
afterEach(() => vi.unstubAllEnvs());

/** FEAT-1 started at 10: one story done at 30, one not started, one added at 40. */
const plan = () => [
  started(),
  moves(story("STORY-1", "FEAT-1"), [20, "In Progress"], [30, "Done"]),
  story("STORY-2", "FEAT-1"),
  story("STORY-3", "FEAT-1", { created: 40 }),
];

describe("AC1: the burn-up is built from the cards' history, with a scope line and a done line", () => {
  it("is on a started feature's row: its baseline, and scope and done each time either changed", () => {
    expect(rowOf(plan())?.burnUp).toEqual({
      since: at(10),
      points: [
        { at: at(10), scope: 2, done: 0 },
        { at: at(30), scope: 2, done: 1 },
        { at: at(40), scope: 3, done: 1 },
      ],
    });
  });

  it("crosses the socket: the client reads it back as sent, and drops what isn't a burn-up", () => {
    const sent = list(plan());
    expect(normalizeWorkList(JSON.parse(JSON.stringify(sent)))).toEqual(sent);
    expect(read({ since: "soon", points: [] })).toBeUndefined();
    expect(read(null)).toBeUndefined();
    expect(
      read({
        since: at(10),
        points: [
          { at: "x", scope: 1, done: 0 },
          { at: at(20), scope: "2" },
        ],
      }),
    ).toEqual({
      since: at(10),
      points: [{ at: at(20), scope: 0, done: 0 }],
    });
  });
});

describe("AC2: it counts what the feature row counts", () => {
  it("counts stories, and bugs with them, by default; the chart ends at the row's count", () => {
    const cards = [
      started(),
      moves(story("STORY-1", "FEAT-1"), [30, "Done"]),
      story("STORY-2", "FEAT-1"),
      story("BUG-1", "FEAT-1", { type: "bug", created: 50 }),
    ];
    const row = rowOf(cards);
    expect(row?.progress).toMatchObject({ done: 1, total: 3 });
    const days = burnUpDays(
      row?.burnUp ?? { since: "", points: [] },
      row?.progress ?? { done: 0, total: 0 },
      new Date(at(60)),
    );
    expect(days.at(-1)).toMatchObject({ kind: "now", scope: 3, done: 1 });
    expect(days.at(-1)).toMatchObject({ scope: row?.progress.total, done: row?.progress.done });
  });

  it("counts tasks in tasks mode: each item weighs the tasks it had then, and a done item counts them all", () => {
    const one = moves(taskAdded(withTasks(story("STORY-1", "FEAT-1"), 0, 2), 20), [50, "Done"]);
    const cards = [started(), one, withTasks(story("STORY-2", "FEAT-1"), 1, 1)];
    expect(burnUp("FEAT-1", cards, tasksMode)).toEqual([
      { at: at(10), scope: 3, done: 0 },
      { at: at(20), scope: 4, done: 0 },
      { at: at(50), scope: 4, done: 3 },
    ]);
  });

  it("ends at the row's task count in tasks mode, ticks included: the history doesn't record when a task was ticked", () => {
    const cards = [
      started(),
      withTasks(story("STORY-1", "FEAT-1"), 2, 5),
      moves(withTasks(story("STORY-2", "FEAT-1"), 0, 1), [30, "Done"]),
    ];
    const row = rowOf(cards, tasksMode);
    expect(row?.progress).toMatchObject({ done: 3, total: 6, label: "3 of 6 tasks done" });
    expect(row?.burnUp?.points.at(-1)).toMatchObject({ scope: 6, done: 1 });
    const days = burnUpDays(
      row?.burnUp ?? { since: "", points: [] },
      row?.progress ?? { done: 0, total: 0 },
      new Date(at(60)),
    );
    expect(days.at(-1)).toMatchObject({ kind: "now", scope: 6, done: 3 });
  });
});

describe("AC3: it starts at the baseline, with one point per local day and a last point for now", () => {
  const cards = [
    started(),
    moves(story("STORY-1", "FEAT-1"), [30, "Done"], [1200, "In Progress"]),
    moves(story("STORY-2", "FEAT-1"), [MIDNIGHT_NOV_3, "Done"]),
    story("BUG-1", "FEAT-1", { type: "bug", created: 1000 }),
    story("STORY-3", "FEAT-1", { created: 5 }),
  ];
  const row = () => rowOf(cards);
  const days = (now: number) => {
    const r = row();
    if (!r?.burnUp) throw new Error("FEAT-1 has no burn-up.");
    return burnUpDays(r.burnUp, r.progress, new Date(at(now)));
  };

  it("has the baseline, the end of each day, and now; a feature started mid-day has that part day first", () => {
    expect(days(MIDNIGHT_NOV_3 + 180)).toEqual([
      { at: at(10), scope: 3, done: 0, kind: "start", label: "Started Nov 1" },
      { at: at(MIDNIGHT_NOV_2), scope: 3, done: 1, kind: "day", label: "Nov 1" },
      // Nov 2: a bug is filed (added scope) and the done story is reopened; the move at midnight is Nov 3's.
      { at: at(MIDNIGHT_NOV_3), scope: 4, done: 0, kind: "day", label: "Nov 2" },
      { at: at(MIDNIGHT_NOV_3 + 180), scope: 4, done: 1, kind: "now", label: "Now" },
    ]);
  });

  it("counts a bug filed after the baseline as added scope, and a story added before it as planned", () => {
    expect(row()?.burnUp?.points[0]).toEqual({ at: at(10), scope: 3, done: 0 });
    expect(row()?.burnUp?.points.find((p) => p.at === at(1000))).toEqual({ at: at(1000), scope: 4, done: 1 });
    expect(row()?.scope.addedBreakdown).toBe("+1 added: 1 bug");
  });

  it("is the baseline and now on the day it started, and never ends before the baseline", () => {
    expect(days(60).map((d) => [d.kind, d.at])).toEqual([
      ["start", at(10)],
      ["now", at(60)],
    ]);
    expect(days(0).map((d) => [d.kind, d.at])).toEqual([
      ["start", at(10)],
      ["now", at(10)],
    ]);
  });

  it("follows local days across a daylight saving change: one point per day", () => {
    vi.stubEnv("TZ", "America/New_York");
    // Oct 31, 12:00 EDT to Nov 3, 12:00 EST; clocks go back on Nov 1.
    const chart = { since: "2026-10-31T16:00:00Z", points: [{ at: "2026-10-31T16:00:00Z", scope: 2, done: 0 }] };
    const out = burnUpDays(chart, { done: 1, total: 2 }, new Date("2026-11-03T17:00:00Z"));
    expect(out.map((d) => [d.label, d.at])).toEqual([
      ["Started Oct 31", "2026-10-31T16:00:00Z"],
      ["Oct 31", "2026-11-01T04:00:00Z"],
      ["Nov 1", "2026-11-02T05:00:00Z"],
      ["Nov 2", "2026-11-03T05:00:00Z"],
      ["Now", "2026-11-03T17:00:00Z"],
    ]);
  });

  it("starts with zeros for a started feature with nothing under it yet", () => {
    const empty = rowOf([started()]);
    expect(empty?.burnUp).toEqual({ since: at(10), points: [] });
    expect(burnUpDays(empty?.burnUp ?? { since: "", points: [] }, { done: 0, total: 0 }, new Date(at(60)))).toEqual([
      { at: at(10), scope: 0, done: 0, kind: "start", label: "Started Nov 1" },
      { at: at(60), scope: 0, done: 0, kind: "now", label: "Now" },
    ]);
  });

  it("leaves a story moved to another feature out from that moment", () => {
    const moved = [started(), story("STORY-1", "FEAT-1"), reparent(story("STORY-2", "FEAT-1"), 30, "FEAT-2")];
    expect(rowOf(moved)?.burnUp?.points).toEqual([
      { at: at(10), scope: 2, done: 0 },
      { at: at(30), scope: 1, done: 0 },
    ]);
  });
});

describe("AC5 and AC6: what the chart says, and nothing before the feature goes in progress", () => {
  it("names the current numbers and the day it started, and nothing to come", () => {
    const text = burnUpText({ done: 3, total: 7 }, at(10));
    expect(text).toBe("Scope 7 · Done 3, since Nov 1");
    expect(text).not.toMatch(/forecast|trend|projected|on track|estimate|eta\b|complet/i);
  });

  it("is left off the row of a feature that never went in progress", () => {
    const cards = [feature("FEAT-1", "approved"), story("STORY-1", "FEAT-1")];
    expect(rowOf(cards)?.burnUp).toBeUndefined();
    expect(rowOf(cards)).not.toHaveProperty("burnUp");
  });
});
