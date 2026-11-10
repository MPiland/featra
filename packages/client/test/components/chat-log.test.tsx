/**
 * STORY-47 AC5: the chat shows what the agent logged, with Undo, through the real App. The host's server is faked
 * (chat-server.ts): it records the Undo, and the test emits what the server tells the chat.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_COPY } from "../../src/chats.ts";
import { renderApp } from "../harness.tsx";

afterEach(cleanup);

const log = () => screen.getByRole("log", { name: CHAT_COPY.transcript });

async function chatting(opts: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp(opts);
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
  await app.user.click(await within(dialog).findByRole("button", { name: /^Developer/ }));
  await screen.findByRole("region", { name: "Developer" });
  return app;
}

describe("AC5: a logged entry shows in the chat with Undo", () => {
  it("shows where it was logged and what it says, for a decision and for a question", async () => {
    const { chats } = await chatting();
    chats.emit(
      "chat-1",
      { type: "logged", entry: "e1", file: "decisions.md", summary: "Use a socket" },
      { type: "logged", entry: "e2", file: "open-questions.md", summary: "Keep Undo after restart?" },
    );
    expect(within(log()).getByText("Logged to decisions.md")).toBeTruthy();
    expect(within(log()).getByText("Use a socket")).toBeTruthy();
    expect(within(log()).getByText("Logged to open-questions.md")).toBeTruthy();
    expect(within(log()).getAllByRole("button", { name: CHAT_COPY.undo })).toHaveLength(2);
  });

  it("sends Undo for that entry only, and shows it undone once the server says so", async () => {
    const { user, calls, chats } = await chatting();
    chats.emit(
      "chat-1",
      { type: "logged", entry: "e1", file: "decisions.md", summary: "First" },
      { type: "logged", entry: "e2", file: "decisions.md", summary: "Second" },
    );
    await user.click(within(log()).getAllByRole("button", { name: CHAT_COPY.undo })[1] as HTMLElement);
    expect(calls).toContain("chat.undoLog:chat-1:e2");
    expect(calls.filter((c) => c.startsWith("chat.undoLog"))).toHaveLength(1);
    chats.emit("chat-1", { type: "log-undone", entry: "e2" });
    expect(within(log()).getByText(CHAT_COPY.undone)).toBeTruthy();
    expect(within(log()).getAllByRole("button", { name: CHAT_COPY.undo })).toHaveLength(1);
  });

  it("shows why Undo didn't work and keeps Undo", async () => {
    const { user, chats } = await chatting({ undoError: "That entry was edited. Remove it from the file yourself." });
    chats.emit("chat-1", { type: "logged", entry: "e1", file: "decisions.md", summary: "First" });
    await user.click(within(log()).getByRole("button", { name: CHAT_COPY.undo }));
    expect((await within(log()).findByRole("alert")).textContent).toBe(
      "That entry was edited. Remove it from the file yourself.",
    );
    expect(within(log()).getByRole("button", { name: CHAT_COPY.undo })).toBeTruthy();
  });
});
