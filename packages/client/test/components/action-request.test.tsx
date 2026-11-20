/**
 * STORY-68 (the user's side): an agent's `request_action` card in its chat and in the Inbox, through the real App over
 * a fake host. The server's tests prove what the answer does to the agent; here, what the user sees and sends.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ACTION_COPY, REQUEST_ACTION_TOOL, type ActionRequest } from "@featra/work-format/action-request";
import type { ChatEvent } from "@featra/work-format";
import { CHAT_COPY } from "../../src/chats.ts";
import { INBOX_COPY } from "../../src/inbox.ts";
import { renderApp, sidebar } from "../harness.tsx";

afterEach(cleanup);

const MINUTE = 60_000;
const REQUEST: ActionRequest = {
  title: "Sign in to the CLI",
  why: "The release needs your account.",
  steps: [
    { text: "Run this in a terminal.", command: "gh auth login" },
    { text: "Pick your account in the browser." },
    { text: "Check it worked.", command: "gh auth status" },
  ],
};
const asked: ChatEvent = {
  type: "approval",
  id: "action-1",
  name: REQUEST_ACTION_TOOL,
  input: { ...REQUEST },
  forChat: false,
};

/** A Developer chat whose agent asked the user to do something: the app and the card. */
async function requested(extra: Partial<Extract<ChatEvent, { type: "approval" }>> = {}) {
  const app = renderApp();
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
  await app.user.click(await within(dialog).findByRole("button", { name: /^Developer/ }));
  await screen.findByRole("region", { name: "Developer" });
  await app.user.type(screen.getByRole("textbox", { name: CHAT_COPY.composer }), "release it{Enter}");
  app.chats.emit("chat-1", { ...asked, ...extra } as ChatEvent);
  const log = screen.getByRole("log", { name: CHAT_COPY.transcript });
  const card = await within(log).findByRole("group", { name: REQUEST.title });
  return { app, card, log };
}

describe("AC2: the request is a card in the chat with its steps, Copy, Done and Can't do it", () => {
  it("shows what to do, why, and each step in order, with Copy only beside a command", async () => {
    const { card, log } = await requested();
    expect(within(card).getByText(ACTION_COPY.asked)).toBeTruthy();
    expect(within(card).getByRole("heading", { name: REQUEST.title })).toBeTruthy();
    expect(within(card).getByText(REQUEST.why!)).toBeTruthy();
    const steps = within(within(card).getByRole("list")).getAllByRole("listitem");
    expect(steps.map((s) => s.querySelector("p")?.textContent)).toEqual(REQUEST.steps.map((s) => s.text));
    expect(steps.map((s) => s.querySelector("code")?.textContent ?? null)).toEqual([
      "gh auth login",
      null,
      "gh auth status",
    ]);
    expect(
      within(card)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual([ACTION_COPY.copyLabel(1), ACTION_COPY.copyLabel(3), ACTION_COPY.done, ACTION_COPY.cantDo]);
    expect(within(card).getByRole("textbox", { name: ACTION_COPY.reason })).toBeTruthy();
    // The row says it waits for the user, not that a tool needs approval.
    expect(within(log).getByText(ACTION_COPY.waiting)).toBeTruthy();
  });

  it("copies a step's command to the clipboard, and says so on that step", async () => {
    const { app, card } = await requested();
    const third = within(card).getByRole("button", { name: ACTION_COPY.copyLabel(3) });
    await app.user.click(third);
    expect(app.calls).toContain("copyText:gh auth status");
    expect(third.textContent).toBe(ACTION_COPY.copied);
    expect(within(card).getByRole("button", { name: ACTION_COPY.copyLabel(1) }).textContent).toBe(ACTION_COPY.copy);
  });

  it("sends Done as the answer, and nothing else runs", async () => {
    const { app, card } = await requested();
    await app.user.click(within(card).getByRole("button", { name: ACTION_COPY.done }));
    expect(app.calls).toContain("chat.approve:chat-1:action-1:allow");
    expect(app.calls.filter((c) => c.startsWith("copyText:"))).toEqual([]);
  });

  it("sends Can't do it with the reason, by the button or Enter, and without one when it is empty", async () => {
    const first = await requested();
    await first.app.user.type(
      within(first.card).getByRole("textbox", { name: ACTION_COPY.reason }),
      "  No admin rights here.  ",
    );
    await first.app.user.click(within(first.card).getByRole("button", { name: ACTION_COPY.cantDo }));
    expect(first.app.calls).toContain("chat.approve:chat-1:action-1:deny:No admin rights here.");
    cleanup();
    const second = await requested();
    await second.app.user.type(within(second.card).getByRole("textbox", { name: ACTION_COPY.reason }), "Later{Enter}");
    expect(second.app.calls).toContain("chat.approve:chat-1:action-1:deny:Later");
    cleanup();
    const third = await requested();
    await third.app.user.click(within(third.card).getByRole("button", { name: ACTION_COPY.cantDo }));
    expect(third.app.calls).toContain("chat.approve:chat-1:action-1:deny");
  });

  it("marks the row Done or Can't do it with the reason once answered", async () => {
    const { app, log } = await requested();
    app.chats.emit("chat-1", {
      type: "tool-denied",
      id: "action-1",
      name: REQUEST_ACTION_TOOL,
      input: { ...REQUEST },
      reason: "No admin rights.",
    });
    expect(await within(log).findByText(ACTION_COPY.cantDo)).toBeTruthy();
    expect(within(log).getByText("No admin rights.")).toBeTruthy();
    expect(within(log).queryByRole("group", { name: REQUEST.title })).toBeNull();
    cleanup();
    const done = await requested();
    done.app.chats.emit("chat-1", {
      type: "tool-allowed",
      id: "action-1",
      name: REQUEST_ACTION_TOOL,
      input: { ...REQUEST },
      scope: "once",
    });
    expect(await within(done.log).findByText(ACTION_COPY.done)).toBeTruthy();
  });

  it("names the story whose session asked, in its Dev Lead's copy", async () => {
    const { card } = await requested({ story: "STORY-9" });
    expect(within(card).getByText(CHAT_COPY.askedFor("STORY-9"))).toBeTruthy();
  });
});

describe("AC4: in the Inbox, the same card, named as a request", () => {
  it("shows the card after the wait, and answers from there", async () => {
    const { app } = await requested();
    app.chats.inbox.advance(10 * MINUTE);
    await app.user.click(within(sidebar()).getByRole("button", { name: /^Inbox/ }));
    const list = await screen.findByRole("region", { name: INBOX_COPY.list });
    // The card's steps are list items too: the Inbox's item is the first, and the only one at its level.
    const [item, ...inner] = within(list).getAllByRole("listitem");
    expect(inner.every((i) => item!.contains(i))).toBe(true);
    expect(within(item!).getByText(ACTION_COPY.kind)).toBeTruthy();
    expect(within(item!).queryByText(REQUEST_ACTION_TOOL)).toBeNull();
    const card = within(item!).getByRole("group", { name: REQUEST.title });
    await app.user.click(within(card).getByRole("button", { name: ACTION_COPY.copyLabel(1) }));
    expect(app.calls).toContain("copyText:gh auth login");
    await app.user.click(within(card).getByRole("button", { name: ACTION_COPY.done }));
    expect(app.calls).toContain("chat.approve:chat-1:action-1:allow");
  });
});
