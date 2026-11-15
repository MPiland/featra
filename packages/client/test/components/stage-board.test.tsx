/**
 * STORY-17: the read-only stage board, through the real App over a fake host whose Work list is built by work-format's
 * `buildWorkList` from the project's cards, and whose UI state is saved as the desktop host saves it.
 */
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildWorkList, DEFAULT_CONFIG, MAIN, setStatus, type Card, type ProjectConfig } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";
import { sessionOf, startStory, STORIES, FEATURE, type App } from "../progress-fixtures.tsx";

afterEach(cleanup);

const OTHER = { dir: "/home/me/website", name: "website" };
const BURN_UP = cardOf({ id: "FEAT-3", type: "feature", status: "approved", title: "Burn-up" });
const MORE = [
  cardOf({
    id: "STORY-7",
    type: "story",
    parent: "FEAT-3",
    status: "In Progress",
    title: "Draw the chart",
    pr: "https://github.com/acme/app/pull/21",
  }),
  cardOf({ id: "BUG-3", type: "bug", parent: "FEAT-3", status: "In Review", title: "Axis is off" }),
  cardOf({ id: "STORY-9", type: "story", status: "Done", title: "Loose story" }),
];
const CARDS = [FEATURE, ...STORIES, BURN_UP, ...MORE];
const host = (state?: { boardProjects?: string[] }) => ({ cards: { [PROJECT.dir]: CARDS }, state });

const layout = () => screen.getByRole("radiogroup", { name: "Layout" });
const option = (name: string) => within(layout()).getByRole("radio", { name });
/** Whether a layout is chosen: the radio's checked state, which assistive tech reads as pressed. */
const checked = (name: string) => (option(name) as HTMLInputElement).checked;
const board = () => screen.queryByRole("region", { name: "Stage board" });
const findBoard = () => screen.findByRole("region", { name: "Stage board" });
const column = (stage: string) => board()?.querySelector(`[data-stage="${stage}"]`) as HTMLElement;
const count = (stage: string) => column(stage).querySelector(".bcol-count")?.textContent;
const cardIn = (id: string) => board()?.querySelector(`[data-card="${id}"]`) as HTMLElement | null;
const cardsIn = (stage: string) =>
  [...column(stage).querySelectorAll("[data-card]")].map((c) => c.getAttribute("data-card"));
const opener = (id: string) => cardIn(id)?.querySelector(".bcard-open") as HTMLElement;
const featureChips = () => screen.getByRole("group", { name: "Filter by feature" });
const chip = (name: string) => within(featureChips()).getByRole("button", { name });
const waiting = (id: string) => within(cardIn(id) as HTMLElement).queryByText("Waiting for you");

/** Opens Work's board from the header toggle. */
async function toBoard(app: App) {
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(option("Board"));
  return findBoard();
}

describe("AC1: a List and Board toggle in Work's header switches to the board, remembered per project", () => {
  it("is a labelled segmented control, List pressed until the user picks Board", async () => {
    const app = renderApp(host());
    await screen.findByRole("region", { name: "Work list" });
    expect(layout().closest(".work-head")).toBeTruthy();
    expect(checked("List")).toBe(true);
    expect(checked("Board")).toBe(false);
    expect(board()).toBeNull();
    await toBoard(app);
    expect(checked("Board")).toBe(true);
    expect(checked("List")).toBe(false);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("saves the choice for this project, and a project that was on the board opens on it", async () => {
    const app = renderApp(host());
    await toBoard(app);
    await waitFor(() => expect(app.saves.at(-1)?.boardProjects).toEqual([PROJECT.dir]));
    cleanup();
    renderApp(host({ boardProjects: [PROJECT.dir] }));
    expect(await findBoard()).toBeTruthy();
    expect(checked("Board")).toBe(true);
  });

  it("choosing List again shows the list and stores nothing", async () => {
    const app = renderApp(host({ boardProjects: [PROJECT.dir] }));
    await findBoard();
    await app.user.click(option("List"));
    expect(board()).toBeNull();
    expect(await screen.findAllByRole("table")).not.toHaveLength(0);
    await waitFor(() => expect(app.saves.at(-1)).toBeDefined());
    expect(app.saves.at(-1)?.boardProjects).toBeUndefined();
  });

  it("is remembered per project: another project keeps its own layout", async () => {
    const app = renderApp({ ...host({ boardProjects: [PROJECT.dir] }), projects: [PROJECT, OTHER] });
    await findBoard();
    await app.user.click(screen.getByRole("button", { name: /^Switch project: / }));
    await app.user.click(
      within(screen.getByRole("menu", { name: "Projects" })).getByRole("menuitemradio", { name: "website" }),
    );
    await waitFor(() => expect(checked("List")).toBe(true));
    expect(board()).toBeNull();
  });
});

describe("AC2: one column per stage, New through Done, in the project's stage order, each with its count", () => {
  it("shows every stage in order with its count, an empty one with its header and 0 and no filler", async () => {
    const app = renderApp(host());
    const found = await toBoard(app);
    const stages = [...found.querySelectorAll(".bcol")].map((c) => c.getAttribute("data-stage"));
    expect(stages).toEqual(["New", "Ready", "In Progress", "In Review", "Acceptance", "Done"]);
    expect(stages.map((s) => count(s ?? ""))).toEqual(["1", "1", "1", "1", "0", "1"]);
    expect(within(column("Acceptance")).getByText("Acceptance")).toBeTruthy();
    expect(column("Acceptance").querySelector(".bcol-cards")?.textContent).toBe("");
    expect(cardsIn("In Review")).toEqual(["BUG-3"]);
    expect(within(cardIn("BUG-3") as HTMLElement).getByRole("img", { name: "Bug" })).toBeTruthy();
  });

  it("titles each column with a level-2 heading, below Work's own title", async () => {
    const app = renderApp(host());
    const found = await toBoard(app);
    const headings = within(found).getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.querySelector("[id]")?.textContent)).toEqual([
      "New",
      "Ready",
      "In Progress",
      "In Review",
      "Acceptance",
      "Done",
    ]);
  });

  it("follows the project's own stages", async () => {
    const config: ProjectConfig = {
      ...DEFAULT_CONFIG,
      stages: [
        { name: "Todo", category: "not-started" },
        { name: "Doing", category: "active" },
        { name: "Shipped", category: "done" },
      ],
    };
    const doing: Card = {
      ...cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", title: "Spawn five" }),
      status: "Doing",
    };
    const owned = [FEATURE, doing].map((card) => ({ card, owner: MAIN, shownFrom: MAIN, path: `${card.id}.md` }));
    const app = renderApp({
      work: { [PROJECT.dir]: buildWorkList({ cards: owned, stale: [], problems: [] }, config) },
    });
    const found = await toBoard(app);
    expect([...found.querySelectorAll(".bcol")].map((c) => c.getAttribute("data-stage"))).toEqual([
      "Todo",
      "Doing",
      "Shipped",
    ]);
    expect(cardsIn("Doing")).toEqual(["STORY-5"]);
  });

  it("moves a card to its new column when the server sends a stage change", async () => {
    const app = renderApp(host());
    await toBoard(app);
    const story = app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-6") as Card;
    app.pushCard(PROJECT.dir, setStatus(story, "In Progress", "user", "2026-11-15T10:00:00Z"));
    await waitFor(() => expect(cardsIn("In Progress")).toEqual(["STORY-6", "STORY-7"]));
    expect(count("Ready")).toBe("0");
  });
});

describe("AC3: a filter shows all features' stories or one feature's", () => {
  it("offers All features and each feature with stories, by ID and title", async () => {
    const app = renderApp(host());
    await toBoard(app);
    expect(
      within(featureChips())
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["All features", "FEAT-2 Delegation", "FEAT-3 Burn-up"]);
    expect(chip("All features").getAttribute("aria-pressed")).toBe("true");
  });

  it("narrows every column to one feature, and back to all", async () => {
    const app = renderApp(host());
    await toBoard(app);
    await app.user.click(chip("FEAT-3 Burn-up"));
    expect(chip("FEAT-3 Burn-up").getAttribute("aria-pressed")).toBe("true");
    expect(["New", "Ready", "In Progress", "In Review", "Acceptance", "Done"].map(count)).toEqual([
      "0",
      "0",
      "1",
      "1",
      "0",
      "0",
    ]);
    expect(cardIn("STORY-9")).toBeNull();
    await app.user.click(chip("All features"));
    expect(cardIn("STORY-5")).toBeTruthy();
    expect(cardIn("STORY-9")).toBeTruthy();
  });
});

describe("AC4: a card shows its ID, title, feature, PR and whether it waits on the user, and opens its card pane", () => {
  it("shows the ID and title, and the feature tag only while all features show", async () => {
    const app = renderApp(host());
    await toBoard(app);
    const card = cardIn("STORY-7") as HTMLElement;
    expect(opener("STORY-7").textContent).toBe("STORY-7 Draw the chart");
    expect(card.querySelector(".bcard-feature")?.textContent).toBe("FEAT-3");
    expect(card.querySelector(".bcard-feature")?.getAttribute("title")).toBe("FEAT-3 Burn-up");
    expect(cardIn("STORY-9")?.querySelector(".bcard-feature")).toBeNull();
    await app.user.click(chip("FEAT-3 Burn-up"));
    expect(cardIn("STORY-7")?.querySelector(".bcard-feature")).toBeNull();
  });

  it("names the feature tag by the feature's ID and title, for a screen reader as for the tooltip", async () => {
    const app = renderApp(host());
    await toBoard(app);
    const tag = cardIn("STORY-7")?.querySelector(".bcard-feature");
    expect(tag?.getAttribute("aria-label")).toBe("FEAT-3 Burn-up");
  });

  it("shows the PR chip of a story with a PR", async () => {
    const app = renderApp(host());
    await toBoard(app);
    expect(within(cardIn("STORY-7") as HTMLElement).getByRole("link", { name: "#21" })).toBeTruthy();
    expect(cardIn("STORY-5")?.querySelector(".pr-chip")).toBeNull();
  });

  it("marks a story whose session waits on an approval, and a story in Acceptance", async () => {
    const app = renderApp(host());
    await screen.findByRole("region", { name: "Work list" });
    await startStory(app);
    await toBoard(app);
    expect(waiting("STORY-5")).toBeNull();
    const chat = sessionOf(app);
    app.chats.emit(chat, { type: "user", text: "Do STORY-5." }, { type: "started", model: "opus" });
    app.chats.emit(chat, { type: "approval", id: "t1", name: "Bash", input: { command: "ls" }, forChat: false });
    await waitFor(() => expect(waiting("STORY-5")?.classList.contains("badge-review")).toBe(true));
    app.chats.emit(chat, { type: "turn-end", outcome: "done" });
    await waitFor(() => expect(waiting("STORY-5")).toBeNull());
    const story = app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-6") as Card;
    app.pushCard(PROJECT.dir, setStatus(story, "Acceptance", "user", "2026-11-15T10:00:00Z"));
    await waitFor(() => expect(waiting("STORY-6")).toBeTruthy());
    expect(waiting("STORY-7")).toBeNull();
  });

  it("opens its card pane on click, and Enter opens it; Escape closes it back to the card", async () => {
    const app = renderApp(host());
    await toBoard(app);
    await app.user.click(opener("STORY-7"));
    const pane = await screen.findByRole("complementary", { name: "STORY-7 card" });
    expect(opener("STORY-7").getAttribute("aria-expanded")).toBe("true");
    expect(opener("STORY-7").getAttribute("aria-controls")).toBe(pane.id);
    expect(cardIn("STORY-7")?.classList.contains("shown")).toBe(true);
    await app.user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(opener("STORY-7"));
    opener("BUG-3").focus();
    await app.user.keyboard("{Enter}");
    expect(await screen.findByRole("complementary", { name: "BUG-3 card" })).toBeTruthy();
    await app.user.keyboard("{Escape}");
    expect(document.activeElement).toBe(opener("BUG-3"));
  });

  it("puts the cards in reading order, column by column, as buttons", async () => {
    const app = renderApp(host());
    const found = await toBoard(app);
    const buttons = [...found.querySelectorAll(".bcard-open")];
    expect(buttons.every((b) => b.tagName === "BUTTON")).toBe(true);
    expect(buttons.map((b) => b.closest("[data-card]")?.getAttribute("data-card"))).toEqual([
      "STORY-5",
      "STORY-6",
      "STORY-7",
      "BUG-3",
      "STORY-9",
    ]);
  });
});

describe("AC5: cards cannot be dragged; stages change only through agents, merges and the card pane", () => {
  it("has nothing draggable and no drag handle", async () => {
    const app = renderApp(host());
    const found = await toBoard(app);
    expect(found.querySelectorAll("[draggable]")).toHaveLength(0);
    expect(found.querySelectorAll("[aria-grabbed], [aria-dropeffect], .drag-handle")).toHaveLength(0);
  });

  it("changes nothing when a card is dragged onto another column", async () => {
    const app = renderApp(host());
    await toBoard(app);
    const before = app.calls.length;
    const target = column("Done");
    fireEvent.dragStart(cardIn("STORY-5") as HTMLElement);
    fireEvent.dragEnter(target);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    fireEvent.dragEnd(cardIn("STORY-5") as HTMLElement);
    expect(app.calls.slice(before)).toEqual([]);
    expect(cardsIn("New")).toEqual(["STORY-5"]);
    expect(app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-5")?.status).toBe("New");
  });
});
