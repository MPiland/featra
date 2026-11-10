/**
 * STORY-49: a drafted feature is reviewed in the chat that drafted it. The real App over a fake host: the card server
 * edits cards with work-format's rules, the chat server renames rows with work-format's `retitle`, and the draft is
 * the real planner's.
 */
import { act, cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, planDraft, type Card } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const BUILT = [cardOf({ id: "FEAT-1", type: "feature", status: "done", title: "Built" })];

/** What the agent's `draft_cards` call makes for `chat`, from the real planner. */
function drafted(chat: string, title = "Shaping"): Card[] {
  const planned = planDraft(
    {
      feature: { title, description: "Talk a feature through." },
      stories: [
        { id: null, title: "Draft it", story: "As a builder, I draft.", criteria: ["It shows"], tasks: ["Build"] },
        { id: null, title: "Review it", story: "As a builder, I review.", criteria: ["It opens"], tasks: ["Wire"] },
      ],
    },
    { cards: BUILT, config: DEFAULT_CONFIG, chat, at: "2026-11-10T09:00:00Z" },
  );
  if (!planned.ok) throw new Error(planned.error);
  return planned.value.writes.map((w) => w.card);
}

/** Starts a Dev Lead chat from the UI, with the project's cards (and any draft) already there. */
async function startChat(cards: Card[] = BUILT) {
  const app = renderApp({ cards: { [PROJECT.dir]: cards } });
  await app.user.click(screen.getByRole("button", { name: "New chat" }));
  const dialog = await screen.findByRole("dialog", { name: "New chat" });
  await app.user.click(await within(dialog).findByRole("button", { name: /^Dev Lead/ }));
  await screen.findByRole("region", { name: "Dev Lead" });
  return app;
}
const pane = (id: string) => screen.queryByRole("complementary", { name: `${id} card` });
const FEATURE = "FEAT-2";
const chatRow = () => document.querySelector("[data-chat=chat-1]") as HTMLElement;

/** The agent drafts while the user watches the chat. */
const draftNow = (app: Awaited<ReturnType<typeof startChat>>, chat = "chat-1") => {
  for (const c of drafted(chat)) app.pushCard(PROJECT.dir, c);
  app.chats.retitle(chat, "Shaping", "draft");
};

describe("AC1: the draft opens as a full-height card pane in the chat that drafted it", () => {
  it("opens beside the chat when the chat drafts, without taking focus from the composer", async () => {
    const app = await startChat();
    const composer = screen.getByRole("textbox", { name: "Message" });
    composer.focus();
    expect(pane(FEATURE)).toBeNull();
    draftNow(app);
    const found = await screen.findByRole("complementary", { name: `${FEATURE} card` });
    const chat = screen.getByRole("region", { name: "Dev Lead" });
    expect(found.parentElement).toBe(chat.parentElement);
    expect(found.parentElement?.classList.contains("work-split")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(composer);
    expect(await within(found).findByRole("button", { name: "Title: Shaping" })).toBeTruthy();
  });

  it("lists the draft's stories, opens one, and goes back to the feature", async () => {
    const app = await startChat();
    draftNow(app);
    const feature = await screen.findByRole("complementary", { name: `${FEATURE} card` });
    const stories = within(feature).getByRole("list", { name: "Stories" });
    expect(
      within(stories)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining("Draft it"), expect.stringContaining("Review it")]);
    await app.user.click(within(stories).getByRole("button", { name: /Review it/ }));
    const story = await screen.findByRole("complementary", { name: /^STORY-\d+ card$/ });
    expect(await within(story).findByRole("button", { name: /^User story: As a builder, I review\./ })).toBeTruthy();
    await app.user.click(within(story).getByRole("button", { name: `Back to ${FEATURE}` }));
    expect(await screen.findByRole("complementary", { name: `${FEATURE} card` })).toBeTruthy();
  });

  it("closes, and the chat's Review draft button opens it again", async () => {
    const app = await startChat();
    draftNow(app);
    const found = await screen.findByRole("complementary", { name: `${FEATURE} card` });
    await app.user.click(within(found).getByRole("button", { name: "Close card" }));
    expect(pane(FEATURE)).toBeNull();
    await app.user.click(screen.getByRole("button", { name: "Review draft" }));
    expect(await screen.findByRole("complementary", { name: `${FEATURE} card` })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review draft" })).toBeNull();
  });

  it("a chat with no draft shows no pane and no button, and another chat's draft isn't its own", async () => {
    await startChat([...BUILT, ...drafted("some-other-chat")]);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("button", { name: "Review draft" })).toBeNull();
  });

  it("does not open by itself for a draft that was already there when the chat opened, but offers it", async () => {
    await startChat([...BUILT, ...drafted("chat-1")]);
    await screen.findByRole("button", { name: "Review draft" });
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

describe("AC2: the chat renames itself to the feature's title", () => {
  it("shows the feature's title in the chat list once the draft is made", async () => {
    const app = await startChat();
    expect(chatRow().textContent).toContain("Dev Lead");
    draftNow(app);
    expect(chatRow().textContent).toBe("Shaping");
  });
});

describe("AC3: Review draft in Work opens that chat with the draft pane", () => {
  it("is on the draft's row, and opens its chat with the pane, focused", async () => {
    const app = renderApp({ cards: { [PROJECT.dir]: [...BUILT, ...drafted("chat-1")] } });
    await app.chats.bridge.start(PROJECT.dir, "dev-lead");
    await screen.findByRole("region", { name: "Work list" });
    const row = document.querySelector(`[data-card="${FEATURE}"]`) as HTMLElement;
    expect(document.querySelector('[data-card="FEAT-1"] button.review-draft')).toBeNull();
    await app.user.click(within(row).getByRole("button", { name: `Review draft ${FEATURE}` }));
    const chat = await screen.findByRole("region", { name: "Dev Lead" });
    const found = await screen.findByRole("complementary", { name: `${FEATURE} card` });
    expect(found.parentElement).toBe(chat.parentElement);
    expect(document.activeElement).toBe(found);
  });

  it("opens the chat that drafted it, not another", async () => {
    const app = renderApp({ cards: { [PROJECT.dir]: [...BUILT, ...drafted("chat-2")] } });
    await app.chats.bridge.start(PROJECT.dir, "developer");
    await app.chats.bridge.start(PROJECT.dir, "dev-lead");
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: `Review draft ${FEATURE}` }));
    await screen.findByRole("complementary", { name: `${FEATURE} card` });
    expect(document.querySelector("[data-chat=chat-2][aria-current=page]")).toBeTruthy();
  });
});

describe("AC4: a draft card is edited in the pane; the edit saves and is recorded in history", () => {
  it("saves a story's title to the owner and appends a by:user content entry", async () => {
    const app = await startChat();
    draftNow(app);
    const feature = await screen.findByRole("complementary", { name: `${FEATURE} card` });
    await app.user.click(within(feature).getByRole("button", { name: /Draft it/ }));
    const story = await screen.findByRole("complementary", { name: /^STORY-\d+ card$/ });
    await app.user.click(await within(story).findByRole("button", { name: "Title: Draft it" }));
    const field = within(story).getByRole("textbox", { name: "Title" });
    await app.user.clear(field);
    await app.user.type(field, "Draft it well{Enter}");
    expect(await within(story).findByRole("button", { name: "Title: Draft it well" })).toBeTruthy();
    const saved = app.cardsIn(PROJECT.dir).find((c) => c.title === "Draft it well") as Card;
    expect(saved.history.at(-1)).toMatchObject({ field: "content", to: "title", by: "user" });
    expect(app.calls.some((c) => c.startsWith(`updateCard:${PROJECT.dir}:${saved.id}:title`))).toBe(true);
  });

  it("edits the feature's description in the same pane", async () => {
    const app = await startChat();
    draftNow(app);
    const feature = await screen.findByRole("complementary", { name: `${FEATURE} card` });
    await app.user.click(await within(feature).findByRole("button", { name: /^User story: Talk a feature through/ }));
    const field = within(feature).getByRole("textbox", { name: "User story" });
    await app.user.clear(field);
    await app.user.type(field, "Mine.");
    await act(async () => field.blur());
    expect(app.cardsIn(PROJECT.dir).find((c) => c.id === FEATURE)?.description).toBe("Mine.");
  });

  it("offers no status choice that approves the draft", async () => {
    const app = await startChat();
    draftNow(app);
    const feature = await screen.findByRole("complementary", { name: `${FEATURE} card` });
    await within(feature).findByRole("button", { name: "Title: Shaping" });
    expect(within(feature).queryByText("Approved")).toBeNull();
    // By role: the status list holds only where the draft is now (Approve and Reject are STORY-51's).
    await app.user.click(within(feature).getByRole("button", { name: "Status: Draft" }));
    const options = within(screen.getByRole("listbox", { name: "Status" })).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Draft"]);
  });
});

describe("which draft is the chat's", () => {
  it("is the newest when the chat has two, the way the server revises it", async () => {
    const first = drafted("chat-1");
    const old = first.find((c) => c.type === "feature") as Card;
    const newer: Card = { ...old, id: "FEAT-20", title: "Newer" };
    const app = renderApp({ cards: { [PROJECT.dir]: [...BUILT, ...first, newer] } });
    await app.chats.bridge.start(PROJECT.dir, "dev-lead");
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: "Review draft FEAT-20" }));
    expect(await screen.findByRole("complementary", { name: "FEAT-20 card" })).toBeTruthy();
    expect(pane(FEATURE)).toBeNull();
  });
});

describe("Review draft when the chat that drafted it is gone", () => {
  it("opens the draft in Work's card pane, with no error", async () => {
    const app = renderApp({ cards: { [PROJECT.dir]: [...BUILT, ...drafted("deleted-chat")] } });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: `Review draft ${FEATURE}` }));
    const found = await screen.findByRole("complementary", { name: `${FEATURE} card` });
    expect(found.parentElement?.contains(screen.getByRole("region", { name: "Work list" }))).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("region", { name: "Dev Lead" })).toBeNull();
    // The stories open in the same pane.
    await app.user.click(within(found).getByRole("button", { name: /Draft it/ }));
    expect(await screen.findByRole("complementary", { name: /^STORY-\d+ card$/ })).toBeTruthy();
  });

  it("takes the chat path when the chat is there", async () => {
    const app = renderApp({ cards: { [PROJECT.dir]: [...BUILT, ...drafted("chat-1")] } });
    await app.chats.bridge.start(PROJECT.dir, "dev-lead");
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: `Review draft ${FEATURE}` }));
    expect(await screen.findByRole("region", { name: "Dev Lead" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Work list" })).toBeNull();
  });
});

describe("the review request is used up once the pane has opened", () => {
  it("going back to the chat shows the header button, not the pane again", async () => {
    const app = renderApp({ cards: { [PROJECT.dir]: [...BUILT, ...drafted("chat-1")] } });
    await app.chats.bridge.start(PROJECT.dir, "dev-lead");
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: `Review draft ${FEATURE}` }));
    await screen.findByRole("complementary", { name: `${FEATURE} card` });
    await app.user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: "Forward" }));
    await screen.findByRole("region", { name: "Dev Lead" });
    expect(await screen.findByRole("button", { name: "Review draft" })).toBeTruthy();
    expect(pane(FEATURE)).toBeNull();
  });
});
