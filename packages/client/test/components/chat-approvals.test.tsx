/**
 * STORY-45: a tool call waiting on the user, inline in the chat, and the sidebar's dot, through the real App. The
 * host's server is faked (chat-server.ts): it records the answer, and the test emits what the server tells the chat.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatEvent } from "@featra/work-format";
import { CHAT_COPY } from "../../src/chats.ts";
import { renderApp } from "../harness.tsx";

afterEach(cleanup);

const BASH = { command: "npm test" };
const composer = () => screen.getByRole("textbox", { name: CHAT_COPY.composer });
const log = () => screen.getByRole("log", { name: CHAT_COPY.transcript });
const prompt = () => within(log()).getByRole("group", { name: `${CHAT_COPY.approve} Bash` });
const button = (name: string) => within(prompt()).getByRole("button", { name });
const reason = () => within(prompt()).getByRole("textbox", { name: CHAT_COPY.denyReason });
const head = () => within(log()).getByRole("button", { name: /^Bash/ });
const dot = () => screen.getByRole("region", { name: CHAT_COPY.chats }).querySelector(".chat-dot");

const call: ChatEvent = { type: "tool", id: "t1", name: "Bash", input: BASH };
const COVERS = "npm test commands";
const ask = (forChat = true): ChatEvent => ({
  type: "approval",
  id: "t1",
  name: "Bash",
  input: BASH,
  forChat,
  ...(forChat ? { covers: COVERS } : {}),
});

/** A Developer chat whose agent asks to run `npm test`. */
async function asked(opts: Parameters<typeof renderApp>[0] = {}, forChat = true) {
  const app = renderApp(opts);
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
  await app.user.click(await within(dialog).findByRole("button", { name: /^Developer/ }));
  await screen.findByRole("region", { name: "Developer" });
  await app.user.type(composer(), "test it{Enter}");
  app.chats.emit("chat-1", call, ask(forChat));
  return app;
}

describe("AC1: a tool call that needs permission shows inline", () => {
  it("shows the tool, its input, Allow, Allow for this chat, a reason and Deny, and marks the row", async () => {
    await asked();
    expect(within(prompt()).getByText(/"command": "npm test"/)).toBeTruthy();
    expect(
      within(prompt())
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([CHAT_COPY.allow, CHAT_COPY.allowForChat, CHAT_COPY.deny]);
    expect(button(CHAT_COPY.allowForChat).getAttribute("title")).toBe(COVERS);
    expect(reason().getAttribute("placeholder")).toBe(CHAT_COPY.denyReasonHint);
    expect(head().textContent).toBe(`Bashnpm test${CHAT_COPY.needsApproval}`);
  });

  it("sends Allow, and shows the call allowed once the server says so", async () => {
    const { user, calls, chats } = await asked();
    await user.click(button(CHAT_COPY.allow));
    expect(calls).toContain("chat.approve:chat-1:t1:allow");
    chats.emit("chat-1", { type: "tool-allowed", id: "t1", name: "Bash", input: BASH, scope: "once" });
    expect(within(log()).queryByRole("group")).toBeNull();
    expect(head().textContent).toBe(`Bashnpm test${CHAT_COPY.allowed}`);
  });

  it("sends Allow for this chat, and shows each call it covers", async () => {
    const { user, calls, chats } = await asked();
    await user.click(button(CHAT_COPY.allowForChat));
    expect(calls).toContain("chat.approve:chat-1:t1:allow-chat");
    chats.emit("chat-1", { type: "tool-allowed", id: "t1", name: "Bash", input: BASH, scope: "chat" });
    expect(head().textContent).toBe(`Bashnpm test${CHAT_COPY.allowedForChat}`);
  });

  it("sends Deny with the reason typed, and shows the call denied with it", async () => {
    const { user, calls, chats } = await asked();
    await user.type(reason(), "Run the unit tests only.");
    await user.click(button(CHAT_COPY.deny));
    expect(calls).toContain("chat.approve:chat-1:t1:deny:Run the unit tests only.");
    chats.emit("chat-1", {
      type: "tool-denied",
      id: "t1",
      name: "Bash",
      input: BASH,
      reason: "Run the unit tests only.",
    });
    expect(head().textContent).toBe(`Bashnpm test${CHAT_COPY.denied}`);
    expect(within(log()).getByText("Run the unit tests only.")).toBeTruthy();
  });

  it("denies on Enter in the reason, and without one when it's blank", async () => {
    const { user, calls } = await asked();
    await user.type(reason(), "   {Enter}");
    expect(calls).toContain("chat.approve:chat-1:t1:deny");
  });

  it("offers no Allow for this chat when the agent says the call may only be allowed once", async () => {
    await asked({}, false);
    expect(within(prompt()).queryByRole("button", { name: CHAT_COPY.allowForChat })).toBeNull();
    expect(button(CHAT_COPY.allow)).toBeTruthy();
  });

  it("shows why the answer wasn't taken, and keeps the request", async () => {
    const { user } = await asked({ approveError: "This request isn't waiting for an answer." });
    await user.click(button(CHAT_COPY.allow));
    expect((await within(prompt()).findByRole("alert")).textContent).toBe("This request isn't waiting for an answer.");
    expect((button(CHAT_COPY.allow) as HTMLButtonElement).disabled).toBe(false);
  });

  it("reaches every control from the keyboard, in order", async () => {
    const { user } = await asked();
    button(CHAT_COPY.allow).focus();
    await user.tab();
    expect(document.activeElement).toBe(button(CHAT_COPY.allowForChat));
    await user.tab();
    expect(document.activeElement).toBe(reason());
    await user.tab();
    expect(document.activeElement).toBe(button(CHAT_COPY.deny));
  });
});

describe("a request that ended unanswered", () => {
  it("is marked cancelled, not denied, and no longer asks", async () => {
    const { chats } = await asked();
    chats.emit("chat-1", { type: "approval-cancelled", id: "t1" });
    expect(within(log()).queryByRole("group")).toBeNull();
    expect(head().textContent).toBe(`Bashnpm test${CHAT_COPY.cancelled}`);
  });

  it("is marked stopped when the user stopped the turn", async () => {
    const { chats } = await asked();
    chats.emit("chat-1", { type: "approval-cancelled", id: "t1" }, { type: "turn-end", outcome: "stopped" });
    expect(head().textContent).toBe(`Bashnpm test${CHAT_COPY.toolStopped}`);
  });
});

describe("AC4: a chat waiting on an approval shows the STORY-21 dot", () => {
  it("shows the dot while the request waits, and clears it once answered", async () => {
    const { chats } = await asked();
    expect(dot()?.getAttribute("data-waiting")).toBe("approval");
    expect(dot()?.textContent).toBe(CHAT_COPY.waiting);
    chats.emit("chat-1", { type: "tool-allowed", id: "t1", name: "Bash", input: BASH, scope: "once" });
    expect(dot()).toBeNull();
  });
});
