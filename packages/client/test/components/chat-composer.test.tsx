/**
 * STORY-22 in the chat view, through the real App: the composer changes role, model, effort and mode (AC1), and the
 * context meter shows tokens used of the window as the agent reports usage (AC2). The host's server is faked
 * (chat-server.ts); what a change does to the next turn, and where the numbers come from, is proved in packages/server.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { meterText } from "@featra/work-format/chat-controls";
import { FULL_ACCESS_WARNING } from "@featra/work-format/modes";
import { BUILT_IN_ROLES } from "@featra/work-format/roles";
import { CHAT_COPY } from "../../src/chats.ts";
import { renderApp } from "../harness.tsx";

afterEach(cleanup);

async function chatting(opts: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp(opts);
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
  await app.user.click(await within(dialog).findByRole("button", { name: /^Developer/ }));
  const chat = await screen.findByRole("region", { name: "Developer" });
  await within(chat).findByRole("button", { name: /^Model:/ });
  return { ...app, chat };
}

/** Opens the named dropdown and picks an option. */
async function pick(user: ReturnType<typeof renderApp>["user"], chat: HTMLElement, name: string, option: string) {
  await user.click(within(chat).getByRole("button", { name: new RegExp(`^${name}:`) }));
  await user.click(within(chat).getByRole("option", { name: option }));
}

describe("AC1: role, model, effort and mode change from the composer", () => {
  it("shows what the chat runs with, in the provider's own names", async () => {
    const { chat } = await chatting();
    const dev = BUILT_IN_ROLES.find((r) => r.id === "developer")!;
    expect(within(chat).getByRole("button", { name: `Role: ${dev.name}` })).toBeTruthy();
    expect(within(chat).getByRole("button", { name: `Model: ${dev.model}` })).toBeTruthy();
    expect(within(chat).getByRole("button", { name: `Effort: ${dev.effort}` })).toBeTruthy();
    expect(within(chat).getByRole("button", { name: "Mode: default (Ask)" })).toBeTruthy();
  });

  it("sends a change to the server, shows the setting it answers, and the header follows", async () => {
    const { chat, user, calls } = await chatting();
    await pick(user, chat, "Model", "opus");
    await pick(user, chat, "Effort", "low");
    await pick(user, chat, "Mode", "plan");
    expect(calls.filter((c) => c.startsWith("chat.configure"))).toEqual([
      'chat.configure:chat-1:{"model":"opus"}',
      'chat.configure:chat-1:{"effort":"low"}',
      'chat.configure:chat-1:{"mode":"plan"}',
    ]);
    expect(within(chat).getByRole("button", { name: "Model: opus" })).toBeTruthy();
    expect(within(chat).getByRole("button", { name: "Mode: plan" })).toBeTruthy();
    expect(chat.querySelector(".chat-meta")?.textContent).toBe("opus · low · plan");
  });

  it("changes the role to another of the same agent, and relabels the chat", async () => {
    const { chat, user, calls } = await chatting();
    await pick(user, chat, "Role", "QA");
    expect(calls).toContain('chat.configure:chat-1:{"role":"qa"}');
    expect(await screen.findByRole("region", { name: "QA" })).toBeTruthy();
  });

  it("marks a full-access mode in the picker, and the composer warns once the chat is in it", async () => {
    const { chat, user } = await chatting();
    await pick(user, chat, "Mode", "bypassPermissions (full access)");
    expect(within(chat).getByRole("status").textContent).toContain(FULL_ACCESS_WARNING);
    await pick(user, chat, "Mode", "default (Ask)");
    expect(within(chat).queryByRole("status")).toBeNull();
  });

  it("says why a change wasn't taken, and keeps the setting as it was", async () => {
    const { chat, user } = await chatting({ configureError: "The agent doesn't offer that." });
    await pick(user, chat, "Model", "opus");
    expect((await within(chat).findByRole("alert")).textContent).toBe("The agent doesn't offer that.");
    expect(within(chat).getByRole("button", { name: /^Model: / }).textContent).not.toContain("opus");
  });
});

describe("AC2: the context meter shows tokens used of the model's window", () => {
  it("is hidden until the agent reports usage", async () => {
    const { chat } = await chatting();
    expect(within(chat).queryByText(new RegExp(`^${CHAT_COPY.context}:`))).toBeNull();
  });

  it("shows used of the window with a bar, and updates after each turn", async () => {
    const { chat, chats } = await chatting();
    chats.emit("chat-1", { type: "usage", used: 12_345, window: 200_000 });
    expect(
      within(chat).getByText(`${CHAT_COPY.context}: ${meterText({ used: 12_345, window: 200_000 })}`),
    ).toBeTruthy();
    expect(within(chat).getByRole("meter", { name: CHAT_COPY.context }).getAttribute("aria-valuenow")).toBe("6");
    chats.emit("chat-1", { type: "usage", used: 50_000, window: 200_000 });
    expect(within(chat).getByText("Context: 50k / 200k tokens")).toBeTruthy();
    expect(within(chat).getByRole("meter", { name: CHAT_COPY.context }).getAttribute("aria-valuenow")).toBe("25");
  });

  it("shows only the tokens, and no bar, when the provider gave no window", async () => {
    const { chat, chats } = await chatting();
    chats.emit("chat-1", { type: "usage", used: 12_345, window: null });
    expect(within(chat).getByText("Context: 12.3k tokens")).toBeTruthy();
    expect(within(chat).queryByRole("meter")).toBeNull();
  });
});
