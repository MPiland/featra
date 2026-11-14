/**
 * STORY-16: the burn-up in a feature's progress pane. The real App over a fake host: lists are built by work-format's
 * `buildWorkList` from the cards, as the server builds them. Only the platform is faked: the clock (Date alone) and the
 * time zone.
 */
import { cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkList,
  DEFAULT_CONFIG,
  MAIN,
  newCard,
  setStatus,
  type Card,
  type OwnedCard,
} from "@featra/work-format";
import { featureRowOf } from "@featra/work-format/feature-progress";
import { PROJECT, renderApp } from "../harness.tsx";
import { cards, FEATURE, fromWork, STORIES } from "../progress-fixtures.tsx";

// FEAT-2 is in progress from Nov 1 (its baseline), and its stories were planned then; it is Nov 4, midday, in UTC.
const NOW = "2026-11-04T12:00:00Z";
beforeEach(() => {
  vi.stubEnv("TZ", "UTC");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const chart = (pane: HTMLElement) => within(pane).getByRole("img", { name: /^Scope / });
const rows = (pane: HTMLElement) =>
  [...pane.querySelectorAll(".fp-burnup tbody tr")].map((tr) =>
    [...tr.querySelectorAll("th, td")].map((c) => c.textContent),
  );
const owned = (card: Card): OwnedCard => ({ card, owner: MAIN, shownFrom: MAIN, path: `.featra/cards/${card.id}.md` });

describe("AC1: the pane shows a burn-up with a scope line and a done line", () => {
  it("draws the two lines from the baseline to now, named by the current numbers, with every day in a table", async () => {
    const app = renderApp({ cards: cards(null) });
    const pane = await fromWork(app);
    const burnUp = within(pane).getByRole("region", { name: "Burn-up chart" });
    expect(chart(pane).getAttribute("aria-label")).toBe("Scope 2 · Done 0, since Nov 1");
    expect([...burnUp.querySelectorAll("path")].map((p) => p.getAttribute("class"))).toEqual([
      "fp-line fp-line-scope",
      "fp-line fp-line-done",
    ]);
    expect(rows(pane)).toEqual([
      ["Started Nov 1", "2", "0"],
      ["Nov 1", "2", "0"],
      ["Nov 2", "2", "0"],
      ["Nov 3", "2", "0"],
      ["Now", "2", "0"],
    ]);
    // Only the first and last day are labelled.
    expect([...burnUp.querySelectorAll(".fp-days span")].map((s) => s.textContent)).toEqual(["Nov 1", "Nov 4"]);
    // It sits between the counts and the stories.
    const stories = within(pane).getByRole("region", { name: "Stories" });
    expect(burnUp.compareDocumentPosition(stories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("AC2: it counts what the feature row counts", () => {
  it("counts tasks when the progress setting is tasks, ending at the row's count", async () => {
    const config = { ...DEFAULT_CONFIG, progress: "tasks" as const };
    const list = buildWorkList({ cards: [FEATURE, ...STORIES].map(owned), stale: [], problems: [] }, config);
    const row = featureRowOf(list, "FEAT-2");
    expect(row?.progress.label).toBe("1 of 3 tasks done");
    const app = renderApp({ work: { [PROJECT.dir]: list } });
    const pane = await fromWork(app);
    expect(chart(pane).getAttribute("aria-label")).toBe("Scope 3 · Done 1, since Nov 1");
    // The history doesn't say when the task was ticked: it counts from now, the row's own count.
    expect(rows(pane).at(-2)).toEqual(["Nov 3", "3", "0"]);
    expect(rows(pane).at(-1)).toEqual(["Now", "3", "1"]);
  });
});

describe("AC4: changes that were never committed still appear in the chart", () => {
  it("follows each card change the server pushes, with no call", async () => {
    const app = renderApp({ cards: cards(null) });
    const pane = await fromWork(app);
    const before = app.calls.length;
    const story = app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-5") as Card;
    app.pushCard(PROJECT.dir, setStatus(story, "Done", "user", "2026-11-03T10:00:00Z"));
    await within(pane).findByRole("img", { name: "Scope 2 · Done 1, since Nov 1" });
    const later = { id: "STORY-8", type: "story" as const, title: "Later", status: "New", parent: "FEAT-2" };
    app.pushCard(PROJECT.dir, newCard({ ...later, origin: "added" }, "user", "2026-11-04T08:00:00Z"));
    await within(pane).findByRole("img", { name: "Scope 3 · Done 1, since Nov 1" });
    expect(rows(pane).at(-2)).toEqual(["Nov 3", "2", "1"]);
    expect(app.calls.slice(before)).toEqual([]);
  });
});

describe("AC5: no forecast, trend line or completion date is shown", () => {
  it("has the scope and done lines and the axis only, and no word about what is to come", async () => {
    const app = renderApp({ cards: cards(null) });
    const pane = await fromWork(app);
    const svg = chart(pane);
    expect([...svg.children].map((c) => c.tagName.toLowerCase())).toEqual(["line", "path", "path"]);
    const said = `${pane.textContent} ${svg.getAttribute("aria-label")}`;
    expect(said).not.toMatch(
      /forecast|trend|projected|on track|estimate|\beta\b|complet|velocity|by (mon|tue|wed|thu|fri|sat|sun)/i,
    );
    // Nothing is drawn past now: the last point is now, at the right edge.
    expect(rows(pane).at(-1)?.[0]).toBe("Now");
  });
});

describe("AC6: before the feature goes in progress the pane says the chart starts then", () => {
  it("says when the chart starts instead of an empty chart, and shows it once the feature starts", async () => {
    const fields = { id: "FEAT-2", type: "feature" as const, title: "Delegation", status: "approved", parent: null };
    const approved = newCard(fields, "user", "2026-11-01T00:00:00Z");
    const app = renderApp({ cards: { [PROJECT.dir]: [approved, ...STORIES] } });
    const pane = await fromWork(app);
    expect(within(pane).getByText("The chart starts when the feature goes in progress.")).toBeTruthy();
    expect(within(pane).queryByRole("img", { name: /^Scope / })).toBeNull();
    expect(within(pane).queryByRole("region", { name: "Burn-up chart" })).toBeNull();
    app.pushCard(PROJECT.dir, setStatus(approved, "active", "user", "2026-11-03T09:00:00Z"));
    await within(pane).findByRole("img", { name: "Scope 2 · Done 0, since Nov 3" });
    expect(within(pane).queryByText("The chart starts when the feature goes in progress.")).toBeNull();
  });
});
