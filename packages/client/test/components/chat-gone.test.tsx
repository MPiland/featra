/**
 * STORY-44 AC4: a restored chat whose session file is gone, through the real App. The host's server is faked
 * (chat-server.ts); the line it shows comes from work-format's real fold of the `gone` problem the server sends.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_COPY } from "../../src/chats.ts";
import { PROJECT, renderApp } from "../harness.tsx";

afterEach(cleanup);

async function goneChat(opts: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp(opts);
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  await app.user.click(await screen.findByRole("button", { name: /^QA/ }));
  await screen.findByRole("region", { name: "QA" });
  app.chats.emit("chat-1", { type: "problem", problem: { type: "gone" } });
  return app;
}

describe("AC4: a chat whose session file is gone", () => {
  it("says so in one line, offers a new chat, and takes no message", async () => {
    await goneChat();
    const line = within(screen.getByRole("log", { name: CHAT_COPY.transcript })).getByRole("status");
    expect(line.textContent).toBe(`${CHAT_COPY.gone}${CHAT_COPY.newChat}`);
    expect(within(line).getByRole("button", { name: CHAT_COPY.newChat })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: CHAT_COPY.composer })).toBeNull();
  });

  it("starts the new chat with the same role, in the same project, and opens it", async () => {
    const { user, calls } = await goneChat();
    const line = within(screen.getByRole("log", { name: CHAT_COPY.transcript })).getByRole("status");
    await user.click(within(line).getByRole("button", { name: CHAT_COPY.newChat }));
    expect(calls.filter((c) => c.startsWith("chat.start"))).toEqual([
      `chat.start:${PROJECT.dir}:qa`,
      `chat.start:${PROJECT.dir}:qa`,
    ]);
    const chat = await screen.findByRole("region", { name: "QA" });
    await expect.poll(() => chat.ownerDocument.querySelector("[data-chat]")?.getAttribute("data-chat")).toBe("chat-2");
    expect(screen.getByRole("textbox", { name: CHAT_COPY.composer })).toBeTruthy();
  });
});
