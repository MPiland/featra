/**
 * STORY-24: a feature's progress pane, from the chat that leads it and from its row in Work. The real App over a fake
 * host: lists are built by work-format's `buildWorkList`, the chat server lists sessions as the server does, and the
 * card server starts stories with work-format's rules.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildWorkList,
  DEFAULT_CONFIG,
  DRAFTED_BY,
  MAIN,
  newCard,
  setStatus,
  type Card,
  type OwnedCard,
} from "@featra/work-format";
import { featureRowOf } from "@featra/work-format/feature-progress";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf, PLAN } from "../work-fixtures.ts";

afterEach(cleanup);

type Host = Parameters<typeof renderApp>[0];
type App = ReturnType<typeof renderApp>;

const drafted = (card: Card, chat: string): Card => ({ ...card, extra: { ...card.extra, [DRAFTED_BY]: chat } });
const FEATURE = cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" });
const STORIES = [
  cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status: "New", title: "Spawn five", acs: [0, 2] }),
  cardOf({ id: "STORY-6", type: "story", parent: "FEAT-2", status: "Ready", title: "Report back", tasks: [1, 3] }),
];
/** FEAT-2, drafted by the project's first chat; FEAT-3 drafted by nobody. */
const cards = (lead: string | null = "chat-1") => ({
  [PROJECT.dir]: [
    lead ? drafted(FEATURE, lead) : FEATURE,
    ...STORIES,
    cardOf({ id: "FEAT-3", type: "feature", status: "approved", title: "Burn-up" }),
  ],
});

const pane = (id = "FEAT-2") => screen.queryByRole("complementary", { name: `${id} progress` });
const findPane = (id = "FEAT-2") => screen.findByRole("complementary", { name: `${id} progress` });
const storyLine = (scope: HTMLElement, id: string) => scope.querySelector(`[data-card="${id}"]`) as HTMLElement;
const progressButton = () => screen.queryByRole("button", { name: "Feature progress" });

/** Starts a chat of `role` from the UI; it is the project's chat-1. */
async function startChat(host: Host, role = "Dev Lead") {
  const app = renderApp(host);
  await app.user.click(screen.getByRole("button", { name: "New chat" }));
  const dialog = await screen.findByRole("dialog", { name: "New chat" });
  await app.user.click(await within(dialog).findByRole("button", { name: new RegExp(`^${role}`) }));
  await screen.findByRole("region", { name: role });
  return app;
}

/** Opens Work and the feature's progress from its row. */
async function fromWork(app: App, id = "FEAT-2") {
  await app.user.click(screen.getByRole("button", { name: "Work" }));
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(await screen.findByRole("button", { name: `Feature progress of ${id}` }));
  return findPane(id);
}

/** Starts STORY-5 from its Work row: its session is a chat under the Dev Lead's. */
async function startStory(app: App) {
  await app.user.click(screen.getByRole("button", { name: "Delegation" }));
  await app.user.click(await screen.findByRole("button", { name: "Start STORY-5" }));
  await waitFor(() => expect(app.calls).toContain(`startStory:${PROJECT.dir}:STORY-5`));
  const row = screen.getByRole("row", { name: /Spawn five/ });
  await within(row).findByRole("button", { name: "Open the session of STORY-5" });
}

const sessionOf = (app: App) => {
  const chat = app
    .cardsIn(PROJECT.dir)
    .find((c) => c.id === "STORY-5")
    ?.sessions.at(-1);
  if (!chat) throw new Error("STORY-5 has no session.");
  return chat;
};

describe("AC1: Feature progress is on a chat that coordinates a feature, and opens docked on the right", () => {
  it("opens the pane beside the chat that drafted the feature, focused, from a button that says so", async () => {
    await startChat({ cards: cards() });
    const button = await screen.findByRole("button", { name: "Feature progress" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await screen.findByRole("region", { name: "Dev Lead" });
    button.click();
    const found = await findPane();
    const chat = screen.getByRole("region", { name: "Dev Lead" });
    expect(found.parentElement).toBe(chat.parentElement);
    expect(found.parentElement?.classList.contains("work-split")).toBe(true);
    // Docked on the right: after the chat, with the card pane's handle between them.
    expect(found.previousElementSibling?.getAttribute("role")).toBe("separator");
    expect(chat.compareDocumentPosition(found) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement).toBe(found);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(found.id);
  });

  it("is on the chat that started a story session of the feature, though it didn't draft it", async () => {
    const app = await startChat({ cards: cards(null) });
    expect(progressButton()).toBeNull();
    await app.user.click(screen.getByRole("button", { name: "Work" }));
    await screen.findByRole("region", { name: "Work list" });
    await startStory(app);
    await app.user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("region", { name: "Dev Lead" });
    await app.user.click(await screen.findByRole("button", { name: "Feature progress" }));
    expect(await findPane()).toBeTruthy();
  });

  it("is not on a chat that leads no feature, nor on a story session", async () => {
    const app = await startChat({ cards: cards("another-chat") }, "Developer");
    await screen.findByRole("region", { name: "Developer" });
    expect(progressButton()).toBeNull();
    await app.user.click(screen.getByRole("button", { name: "Work" }));
    await screen.findByRole("region", { name: "Work list" });
    await startStory(app);
    await app.user.click(screen.getByRole("button", { name: "Open the session of STORY-5" }));
    await screen.findByRole("log", { name: "Chat" });
    expect(progressButton()).toBeNull();
  });

  it("closes with Escape, its close button or the button again, and focus goes back to the button", async () => {
    const app = await startChat({ cards: cards() });
    const button = await screen.findByRole("button", { name: "Feature progress" });
    await app.user.click(button);
    await findPane();
    await app.user.keyboard("{Escape}");
    expect(pane()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Feature progress" })));
    await app.user.keyboard("{Enter}");
    const found = await findPane();
    await app.user.click(within(found).getByRole("button", { name: "Close feature progress" }));
    expect(pane()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Feature progress" })));
    await app.user.click(screen.getByRole("button", { name: "Feature progress" }));
    await findPane();
    await app.user.click(screen.getByRole("button", { name: "Feature progress" }));
    expect(pane()).toBeNull();
  });
});

describe("AC2: a feature's row in Work opens the same pane", () => {
  it("opens it beside the list for a feature with no chat, and Escape puts focus back on the row", async () => {
    const app = renderApp({ cards: cards(null) });
    const found = await fromWork(app, "FEAT-3");
    const list = screen.getByRole("region", { name: "Work list" });
    expect(found.parentElement).toBe(list.parentElement);
    expect(within(found).getByRole("heading", { name: "Burn-up" })).toBeTruthy();
    expect(document.activeElement).toBe(found);
    const button = screen.getByRole("button", { name: "Feature progress of FEAT-3" });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await app.user.keyboard("{Escape}");
    expect(pane("FEAT-3")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("is one pane on the right: a story's card replaces it, and Progress replaces the card", async () => {
    const app = renderApp({ cards: cards(null) });
    await fromWork(app);
    await app.user.click(screen.getByRole("button", { name: "Delegation" }));
    await app.user.click(screen.getByRole("button", { name: "Spawn five" }));
    expect(await screen.findByRole("complementary", { name: "STORY-5 card" })).toBeTruthy();
    expect(pane()).toBeNull();
    await app.user.click(screen.getByRole("button", { name: "Feature progress of FEAT-2" }));
    await findPane();
    expect(screen.queryByRole("complementary", { name: "STORY-5 card" })).toBeNull();
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("keeps the feature's card a click away", async () => {
    const app = renderApp({ cards: cards(null) });
    const found = await fromWork(app);
    await app.user.click(within(found).getByRole("button", { name: "Card" }));
    const card = await screen.findByRole("complementary", { name: "FEAT-2 card" });
    await app.user.click(within(card).getByRole("button", { name: "Back to FEAT-2 progress" }));
    expect(await findPane()).toBeTruthy();
  });
});

/** Items that join FEAT-2 after it went in progress (the fixtures start it at 2026-11-01). */
const later = (id: string, type: "story" | "bug"): Card =>
  newCard(
    { id, type, title: id, status: "New", parent: "FEAT-2", origin: type === "bug" ? "bug" : "added" },
    "user",
    "2026-11-05T00:00:00Z",
  );
/** The PLAN project with FEAT-2 started on its own branch, which owns its cards (ADR 0002), and scope added since. */
function startedOnBranch() {
  const all = [...PLAN.map(cardOf), later("STORY-7", "story"), later("BUG-4", "bug")];
  const onBranch = new Set(["FEAT-2", "STORY-2", "STORY-3", "STORY-7", "BUG-4"]);
  const owned = (card: Card): OwnedCard => {
    const owner = onBranch.has(card.id) ? { kind: "feature" as const, branch: "feature/2-cards" } : MAIN;
    return { card, owner, shownFrom: owner, path: `.featra/cards/${card.id}.md` };
  };
  return buildWorkList({ cards: all.map(owned), stale: [], problems: [] }, DEFAULT_CONFIG);
}

describe("AC3: the pane shows the feature's counts, scope, branch and each story", () => {
  it("shows the counts and bar, added scope, open bugs and branch", async () => {
    const list = startedOnBranch();
    const app = renderApp({ work: { [PROJECT.dir]: list } });
    const found = await fromWork(app);
    const row = featureRowOf(list, "FEAT-2");
    expect(within(found).getByText(row?.progress.label ?? "?")).toBeTruthy();
    expect(within(found).getByRole("img", { name: row?.breakdown ?? "?" })).toBeTruthy();
    const facts = Object.fromEntries(
      [...found.querySelectorAll(".fp-facts dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]),
    );
    expect(facts).toEqual({
      Added: "+2 added: 1 story · 1 bug",
      "Open bugs": "1 open bug",
      Branch: "feature/2-cards",
    });
  });

  it("lists each story with its stage, criteria, tasks and PR", async () => {
    const list = startedOnBranch();
    const app = renderApp({ work: { [PROJECT.dir]: list } });
    const found = await fromWork(app);
    const stories = within(found).getByRole("list", { name: "Stories" });
    // In the Work list's order, as its rows have them.
    const ids = featureRowOf(list, "FEAT-2")?.stories.map((s) => s.id);
    expect(ids?.toSorted()).toEqual(["BUG-4", "STORY-2", "STORY-3", "STORY-7"]);
    expect([...stories.querySelectorAll("[data-card]")].map((li) => li.getAttribute("data-card"))).toEqual(ids);
    const open = storyLine(stories, "STORY-2");
    expect(within(open).getByRole("button", { name: "STORY-2 Open a folder" })).toBeTruthy();
    expect(within(open).getByText("In Progress")).toBeTruthy();
    expect(within(open).getByText("Criteria 1 / 3")).toBeTruthy();
    expect(within(open).getByText("Tasks 4 / 6")).toBeTruthy();
    expect(within(open).getByText("#15")).toBeTruthy();
    expect(within(storyLine(stories, "STORY-3")).getByText("Tasks —")).toBeTruthy();
    expect(within(storyLine(stories, "BUG-4")).getByRole("img", { name: "Bug" })).toBeTruthy();
  });

  it("says None where nothing was added, no bug is open and main owns the feature", async () => {
    const app = renderApp({ cards: cards(null) });
    const found = await fromWork(app);
    const values = [...found.querySelectorAll(".fp-facts dd")].map((dd) => dd.textContent);
    expect(values).toEqual(["None", "None", "None"]);
  });
});

describe("AC4: a story opens its chat, or its card, and a story waiting on the user is marked", () => {
  it("opens the card of a story with no chat, with the way back to the progress pane", async () => {
    const app = renderApp({ cards: cards(null) });
    const found = await fromWork(app);
    await app.user.click(within(found).getByRole("button", { name: "STORY-6 Report back" }));
    const card = await screen.findByRole("complementary", { name: "STORY-6 card" });
    expect(document.activeElement).toBe(card);
    await app.user.click(within(card).getByRole("button", { name: "Back to FEAT-2 progress" }));
    expect(await findPane()).toBeTruthy();
  });

  it("opens the session of a story that has one", async () => {
    const app = renderApp({ cards: cards(null) });
    await screen.findByRole("region", { name: "Work list" });
    await startStory(app);
    const chat = sessionOf(app);
    await app.user.click(screen.getByRole("button", { name: "Feature progress of FEAT-2" }));
    const found = await findPane();
    await app.user.click(within(found).getByRole("button", { name: "STORY-5 Spawn five" }));
    await screen.findByRole("log", { name: "Chat" });
    expect(document.querySelector(`[data-chat="${chat}"][aria-current=page]`)).toBeTruthy();
  });

  it("is a keyboard button", async () => {
    const app = renderApp({ cards: cards(null) });
    const found = await fromWork(app);
    within(found).getByRole("button", { name: "STORY-6 Report back" }).focus();
    await app.user.keyboard("{Enter}");
    expect(await screen.findByRole("complementary", { name: "STORY-6 card" })).toBeTruthy();
  });

  it("marks a story whose session waits on an approval, and a story in Acceptance", async () => {
    const app = renderApp({ cards: cards(null) });
    await screen.findByRole("region", { name: "Work list" });
    await startStory(app);
    const found = await fromWork(app);
    const line = () => storyLine(found, "STORY-5");
    expect(within(line()).queryByText("Waiting for you")).toBeNull();
    const chat = sessionOf(app);
    app.chats.emit(chat, { type: "user", text: "Do STORY-5." }, { type: "started", model: "opus" });
    app.chats.emit(chat, { type: "approval", id: "t1", name: "Bash", input: { command: "ls" }, forChat: false });
    expect(await within(line()).findByText("Waiting for you")).toBeTruthy();
    app.chats.emit(chat, { type: "turn-end", outcome: "done" });
    await waitFor(() => expect(within(line()).queryByText("Waiting for you")).toBeNull());
    const story = app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-5") as Card;
    app.pushCard(PROJECT.dir, setStatus(story, "Acceptance", `session:${chat}`, "2026-11-12T10:00:00Z"));
    expect(await within(line()).findByText("Waiting for you")).toBeTruthy();
    expect(within(storyLine(found, "STORY-6")).queryByText("Waiting for you")).toBeNull();
  });
});

describe("AC5: the pane updates live from the cards and spends no agent tokens", () => {
  it("follows a card change pushed by the server, with no call and no second watch", async () => {
    const app = renderApp({ cards: cards(null) });
    await screen.findByRole("region", { name: "Work list" });
    const watches = app.watching(PROJECT.dir);
    const found = await fromWork(app);
    const before = app.calls.length;
    expect(within(storyLine(found, "STORY-6")).getByText("Ready")).toBeTruthy();
    const story = app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-6") as Card;
    app.pushCard(PROJECT.dir, setStatus(story, "Done", "user", "2026-11-12T10:00:00Z"));
    await within(storyLine(found, "STORY-6")).findByText("Done");
    expect(within(found).getByText("1 of 2 stories done")).toBeTruthy();
    app.pushCard(PROJECT.dir, cardOf({ id: "STORY-8", type: "story", parent: "FEAT-2", title: "Later" }));
    expect(await within(found).findByRole("button", { name: "STORY-8 Later" })).toBeTruthy();
    expect(app.calls.slice(before)).toEqual([]);
    expect(app.watching(PROJECT.dir)).toBe(watches);
  });

  it("in a chat, reads the list the chat already watches", async () => {
    const app = await startChat({ cards: cards() });
    await screen.findByRole("button", { name: "Feature progress" });
    const watches = app.watching(PROJECT.dir);
    const before = app.calls.length;
    await app.user.click(screen.getByRole("button", { name: "Feature progress" }));
    const found = await findPane();
    const story = app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-5") as Card;
    app.pushCard(PROJECT.dir, setStatus(story, "In Progress", "user", "2026-11-12T10:00:00Z"));
    expect(await within(storyLine(found, "STORY-5")).findByText("In Progress")).toBeTruthy();
    expect(app.calls.slice(before)).toEqual([]);
    expect(app.watching(PROJECT.dir)).toBe(watches);
  });

  it("says so when the feature leaves the project", async () => {
    const app = renderApp({ work: { [PROJECT.dir]: startedOnBranch() } });
    const found = await fromWork(app);
    app.pushWork(PROJECT.dir, buildWorkList({ cards: [], stale: [], problems: [] }, DEFAULT_CONFIG));
    expect(await within(found).findByText("This feature isn't in the project any more.")).toBeTruthy();
    expect(within(found).queryByRole("button", { name: "Card" })).toBeNull();
  });
});
