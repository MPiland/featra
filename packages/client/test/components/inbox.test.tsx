/**
 * STORY-7: the Inbox view, the sidebar's count, the notification hand-off and the Settings that control them, through
 * the real App. The host's server is faked (chat-server.ts, inbox-server.ts): its clock is moved by hand, and the rules
 * for what is due and what an answer closes are work-format's real ones.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatEvent, Question } from "@featra/work-format";
import { CHAT_COPY } from "../../src/chats.ts";
import { INBOX_COPY } from "../../src/inbox.ts";
import { PROJECT, renderApp, sidebar } from "../harness.tsx";
import { openSettings } from "./settings/helpers.tsx";

afterEach(cleanup);

const MINUTE = 60_000;
const BASH = { command: "npm test" };
const call: ChatEvent = { type: "tool", id: "t1", name: "Bash", input: BASH };
const approval: ChatEvent = { type: "approval", id: "t1", name: "Bash", input: BASH, forChat: true };
const COLOUR: Question = {
  question: "Which colour?",
  header: "Colour",
  options: [
    { label: "Blue", description: "Calm" },
    { label: "Red", description: "Loud" },
  ],
  multiSelect: false,
};
const questionCall: ChatEvent = { type: "tool", id: "q1", name: "AskUserQuestion", input: { questions: [COLOUR] } };
const question: ChatEvent = { type: "question", id: "q1", name: "AskUserQuestion", questions: [COLOUR] };
const allowed: ChatEvent = { type: "tool-allowed", id: "t1", name: "Bash", input: BASH, scope: "once" };

const inboxEntry = () => within(sidebar()).getByRole("button", { name: /^Inbox/ });
const main = () => screen.getByRole("main");
const inbox = () => within(main()).queryByRole("region", { name: INBOX_COPY.list });
const openInbox = (user: { click: (el: Element) => Promise<void> }) => user.click(inboxEntry());

/** A Developer chat named "test it", started through the UI. */
async function started(opts: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp(opts);
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
  await app.user.click(await within(dialog).findByRole("button", { name: /^Developer/ }));
  await screen.findByRole("region", { name: "Developer" });
  await app.user.type(screen.getByRole("textbox", { name: CHAT_COPY.composer }), "test it{Enter}");
  return app;
}

describe("AC1: a request unanswered for the wait also appears in the Inbox with its chat and card", () => {
  it("is in the chat at once and in the Inbox only after the wait, with its chat's name and the card", async () => {
    const app = await started({ chatCards: { developer: "STORY-9" } });
    await app.user.click(within(sidebar()).getByRole("button", { name: "Work" }));
    app.chats.emit("chat-1", call, approval);
    await openInbox(app.user);
    expect(within(main()).getByText(INBOX_COPY.empty)).toBeTruthy();
    app.chats.inbox.advance(10 * MINUTE - 1);
    expect(inbox()).toBeNull();
    app.chats.inbox.advance(1);
    const list = await screen.findByRole("region", { name: INBOX_COPY.list });
    const item = within(list).getByRole("listitem");
    expect(within(item).getByRole("button", { name: "test it" })).toBeTruthy();
    expect(within(item).getByText("STORY-9")).toBeTruthy();
    expect(within(item).getByText("Bash")).toBeTruthy();
    expect(within(item).getByText(/"command": "npm test"/)).toBeTruthy();
  });

  it("shows a question as the chat does: its options and Submit", async () => {
    const app = await started();
    app.chats.emit("chat-1", questionCall, question);
    app.chats.inbox.advance(10 * MINUTE);
    await openInbox(app.user);
    const form = await screen.findByRole("form", { name: CHAT_COPY.question });
    expect(within(form).getByRole("radio", { name: /Blue/ })).toBeTruthy();
    expect(within(form).getByRole("button", { name: CHAT_COPY.submit })).toBeTruthy();
  });

  it("takes the wait from Settings > General: the page watches the server again with a changed wait", async () => {
    const app = await started();
    await waitFor(() => expect(app.chats.inbox.watches.at(-1)?.wait).toBe(10 * MINUTE));
    const before = app.chats.inbox.watches.length;
    await openSettings(app.user, "General");
    await app.user.click(screen.getByRole("button", { name: "Inbox wait: 10 minutes" }));
    await app.user.click(screen.getByRole("option", { name: "5 minutes" }));
    expect(app.appSaved().at(-1)).toMatchObject({ inboxWaitMinutes: 5 });
    await waitFor(() => expect(app.chats.inbox.watches.at(-1)?.wait).toBe(5 * MINUTE));
    expect(app.chats.inbox.watches.length).toBeGreaterThan(before);
    expect(app.chats.inbox.watching()).toBe(1);
  });

  it("uses a wait Settings already holds, a custom one included", async () => {
    const app = renderApp({ settings: { inboxWaitMinutes: 0.05 } });
    await waitFor(() => expect(app.chats.inbox.watches.at(-1)?.wait).toBe(3000));
    await openSettings(app.user, "General");
    expect(screen.getByRole("button", { name: "Inbox wait: 3 seconds" })).toBeTruthy();
  });
});

describe("AC2: answering it in the Inbox or the chat answers it once and clears it from both", () => {
  it("answers through the chat's own approve call, and clears the item when the server records the answer", async () => {
    const app = await started();
    app.chats.emit("chat-1", call, approval);
    app.chats.inbox.advance(10 * MINUTE);
    await openInbox(app.user);
    const item = await within(main()).findByRole("listitem");
    await app.user.click(within(item).getByRole("button", { name: CHAT_COPY.allow }));
    expect(app.actions().filter((a) => a.startsWith("chat.approve"))).toEqual(["chat.approve:chat-1:t1:allow"]);
    app.chats.emit("chat-1", allowed);
    await waitFor(() => expect(inbox()).toBeNull());
    expect(within(main()).getByText(INBOX_COPY.empty)).toBeTruthy();
    expect(inboxEntry().textContent).toBe("Inbox");
  });

  it("denies with a reason from the Inbox the same way the chat does", async () => {
    const app = await started();
    app.chats.emit("chat-1", call, approval);
    app.chats.inbox.advance(10 * MINUTE);
    await openInbox(app.user);
    const item = await within(main()).findByRole("listitem");
    await app.user.type(within(item).getByRole("textbox", { name: CHAT_COPY.denyReason }), "unit only");
    await app.user.click(within(item).getByRole("button", { name: CHAT_COPY.deny }));
    expect(app.actions().filter((a) => a.startsWith("chat.approve"))).toEqual([
      "chat.approve:chat-1:t1:deny:unit only",
    ]);
  });

  it("answers a question from the Inbox through chat.answer", async () => {
    const app = await started();
    app.chats.emit("chat-1", questionCall, question);
    app.chats.inbox.advance(10 * MINUTE);
    await openInbox(app.user);
    const form = await screen.findByRole("form", { name: CHAT_COPY.question });
    await app.user.click(within(form).getByRole("radio", { name: /Red/ }));
    await app.user.click(within(form).getByRole("button", { name: CHAT_COPY.submit }));
    expect(app.actions().filter((a) => a.startsWith("chat.answer"))).toEqual([
      `chat.answer:chat-1:q1:${JSON.stringify({ [COLOUR.question]: ["Red"] })}`,
    ]);
  });

  it("shows why an answer wasn't taken, and keeps the item", async () => {
    const app = await started({ approveError: "Not waiting." });
    app.chats.emit("chat-1", call, approval);
    app.chats.inbox.advance(10 * MINUTE);
    await openInbox(app.user);
    const item = await within(main()).findByRole("listitem");
    await app.user.click(within(item).getByRole("button", { name: CHAT_COPY.allow }));
    expect((await within(item).findByRole("alert")).textContent).toBe("Not waiting.");
    expect(within(main()).getAllByRole("listitem")).toHaveLength(1);
  });

  it("clears the item when the chat answers it, with the Inbox open", async () => {
    const app = await started();
    app.chats.emit("chat-1", call, approval);
    app.chats.inbox.advance(10 * MINUTE);
    await openInbox(app.user);
    await within(main()).findByRole("listitem");
    app.chats.emit("chat-1", allowed);
    await waitFor(() => expect(inbox()).toBeNull());
  });

  it("clears the item when the turn is stopped while it waits", async () => {
    const app = await started();
    app.chats.emit("chat-1", call, approval);
    app.chats.inbox.advance(10 * MINUTE);
    await openInbox(app.user);
    await within(main()).findByRole("listitem");
    app.chats.emit("chat-1", { type: "approval-cancelled", id: "t1" }, { type: "turn-end", outcome: "stopped" });
    await waitFor(() => expect(inbox()).toBeNull());
  });

  it("opens the chat from its item", async () => {
    const app = await started();
    app.chats.emit("chat-1", call, approval);
    app.chats.inbox.advance(10 * MINUTE);
    await openInbox(app.user);
    await app.user.click(within(await within(main()).findByRole("listitem")).getByRole("button", { name: "test it" }));
    expect(await screen.findByRole("region", { name: "Developer" })).toBeTruthy();
  });
});

describe("AC3: the page hands each request to the host as it arrives", () => {
  it("tells the host at once, before the wait, once per request", async () => {
    const app = await started();
    app.chats.emit("chat-1", call, approval);
    expect(app.calls.filter((c) => c.startsWith("notify:"))).toEqual(["notify:chat-1:t1"]);
    app.chats.emit("chat-1", allowed, questionCall, question);
    expect(app.calls.filter((c) => c.startsWith("notify:"))).toEqual(["notify:chat-1:t1", "notify:chat-1:q1"]);
  });

  it("opens the chat a clicked notification names", async () => {
    const app = await started();
    await app.user.click(within(sidebar()).getByRole("button", { name: "Work" }));
    expect(screen.queryByRole("region", { name: "Developer" })).toBeNull();
    app.clickNotification("chat-1");
    expect(await screen.findByRole("region", { name: "Developer" })).toBeTruthy();
  });

  it("turns notifications off and on in Settings > General", async () => {
    const app = renderApp();
    await openSettings(app.user, "General");
    const toggle = screen.getByRole("switch", { name: "Notifications" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await app.user.click(toggle);
    expect(app.appSaved().at(-1)).toMatchObject({ notifications: false });
    expect(screen.getByRole("switch", { name: "Notifications" }).getAttribute("aria-checked")).toBe("false");
    await app.user.click(screen.getByRole("switch", { name: "Notifications" }));
    expect(app.appSaved().at(-1)).toMatchObject({ notifications: true });
  });
});

describe("AC4: the sidebar's Inbox shows how many are waiting", () => {
  it("shows nothing at first, then the count of items past the wait, and nothing again when they are answered", async () => {
    const app = await started();
    expect(inboxEntry().textContent).toBe("Inbox");
    app.chats.emit("chat-1", call, approval);
    // Waiting in the chat is not waiting in the Inbox.
    expect(inboxEntry().textContent).toBe("Inbox");
    app.chats.inbox.advance(10 * MINUTE);
    expect(inboxEntry().textContent).toContain("1");
    expect(within(inboxEntry()).getByText("1 waiting", { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Inbox, 1 waiting" })).toBeTruthy();
    app.chats.emit("chat-1", allowed);
    await waitFor(() => expect(inboxEntry().textContent).toBe("Inbox"));
  });

  it("counts every request, across chats and kinds", async () => {
    const app = await started();
    app.chats.emit("chat-1", call, approval, questionCall, question);
    app.chats.inbox.advance(10 * MINUTE);
    expect(screen.getByRole("button", { name: "Inbox, 2 waiting" })).toBeTruthy();
  });

  it("shows the count from any view", async () => {
    const app = await started();
    app.chats.emit("chat-1", call, approval);
    app.chats.inbox.advance(10 * MINUTE);
    await app.user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("button", { name: "Inbox, 1 waiting" })).toBeTruthy();
  });
});

type User = ReturnType<typeof renderApp>["user"];
/** Makes the website project current, through the project switcher. */
const inWebsite = async ({ user }: { user: User }) => {
  await user.click(screen.getByRole("button", { name: /^Switch project: / }));
  await user.click(screen.getByRole("menuitemradio", { name: "website" }));
  await waitFor(() => expect(within(sidebar()).getByRole("button", { name: /^Switch project: website/ })).toBeTruthy());
};

describe("every open project, not only the one in front (review fixes)", () => {
  const WEBSITE = { dir: "/home/me/website", name: "website" };

  it("watches without a project, so one watch covers every project", async () => {
    const app = await started({ projects: [PROJECT, WEBSITE] });
    await waitFor(() => expect(app.chats.inbox.watches.length).toBeGreaterThan(0));
    expect(app.chats.inbox.watches.every((w) => w.dir === null)).toBe(true);
    await inWebsite(app);
    expect(app.chats.inbox.watches.every((w) => w.dir === null)).toBe(true);
    expect(app.chats.inbox.watching()).toBe(1);
  });

  it("counts and lists another project's request, shows its project, and notifies for it", async () => {
    const app = await started({ projects: [PROJECT, WEBSITE] });
    await inWebsite(app);
    app.chats.emit("chat-1", call, approval);
    expect(app.calls).toContain("notify:chat-1:t1");
    app.chats.inbox.advance(10 * MINUTE);
    expect(inboxEntry().textContent).toContain("1");
    await openInbox(app.user);
    const item = within(main()).getByRole("listitem");
    expect(within(item).getByText("manager")).toBeTruthy();
  });

  it("switches to the item's project, then opens its chat", async () => {
    const app = await started({ projects: [PROJECT, WEBSITE] });
    app.chats.emit("chat-1", call, approval);
    app.chats.inbox.advance(10 * MINUTE);
    await inWebsite(app);
    await openInbox(app.user);
    await app.user.click(within(await within(main()).findByRole("listitem")).getByRole("button", { name: "test it" }));
    await waitFor(() => expect(app.calls).toContain(`switchTo:${PROJECT.dir}`));
    expect(await screen.findByRole("region", { name: "Developer" })).toBeTruthy();
    expect(within(sidebar()).getByRole("button", { name: /^Switch project: manager/ })).toBeTruthy();
  });

  it("switches to a clicked notification's project, then opens its chat", async () => {
    const app = await started({ projects: [PROJECT, WEBSITE] });
    app.chats.emit("chat-1", call, approval);
    await inWebsite(app);
    expect(screen.queryByRole("region", { name: "Developer" })).toBeNull();
    app.clickNotification("chat-1", PROJECT.dir);
    expect(await screen.findByRole("region", { name: "Developer" })).toBeTruthy();
    expect(app.calls).toContain(`switchTo:${PROJECT.dir}`);
  });
});
