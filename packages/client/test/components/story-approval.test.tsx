/**
 * STORY-9 AC3 (the user's side): a story session's approval, as the Dev Lead's chat shows it, says which story asked and
 * is answered there like any other. Through the real App; the server is faked and the test emits what it tells the chat.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_COPY } from "../../src/chats.ts";
import { renderApp } from "../harness.tsx";

afterEach(cleanup);

describe("AC3: an approval a story session still needs", () => {
  it("is labelled with the story in the Dev Lead's chat, and Allow answers it", async () => {
    const app = renderApp();
    await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
    const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
    await app.user.click(await within(dialog).findByRole("button", { name: /^Dev Lead/ }));
    await screen.findByRole("region", { name: "Dev Lead" });
    app.chats.emit("chat-1", {
      type: "approval",
      id: "c1",
      name: "Bash",
      input: { command: "git status" },
      forChat: false,
      story: "STORY-5",
    });
    const log = screen.getByRole("log", { name: CHAT_COPY.transcript });
    const prompt = await within(log).findByRole("group", { name: `${CHAT_COPY.approve} Bash` });
    expect(within(prompt).getByText("Asked by the session of STORY-5")).toBeTruthy();
    await app.user.click(within(prompt).getByRole("button", { name: CHAT_COPY.allow }));
    expect(app.calls).toContain("chat.approve:chat-1:c1:allow");
  });
});
