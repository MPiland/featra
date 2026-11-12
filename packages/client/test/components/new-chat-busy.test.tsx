/**
 * BUG-19: while a new chat starts, the role picker says so and takes no second pick, so a double click makes one chat.
 * Through the real App; the host's server is faked (chat-server.ts) and holds `chat.start` until the test lets it answer.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_COPY } from "../../src/chats.ts";
import { PROJECT, renderApp } from "../harness.tsx";

afterEach(cleanup);

async function openPicker() {
  const app = renderApp({ slowStart: true });
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
  const developer = await within(dialog).findByRole("button", { name: /^Developer/ });
  return { app, dialog, developer };
}

describe("a chat that is starting", () => {
  it("disables the roles and says Starting, and a second click starts no second chat", async () => {
    const { app, dialog, developer } = await openPicker();
    await app.user.click(developer);
    await app.user.click(developer);
    const buttons = within(within(dialog).getByRole("list", { name: CHAT_COPY.roles })).getAllByRole("button");
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(within(dialog).getByRole("status").textContent).toBe(CHAT_COPY.starting);
    expect(app.calls.filter((c) => c.startsWith("chat.start:"))).toEqual([`chat.start:${PROJECT.dir}:developer`]);

    await app.chats.releaseStart();
    await screen.findByRole("region", { name: "Developer" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(app.calls.filter((c) => c.startsWith("chat.start:"))).toHaveLength(1);
  });

  it("offers the roles again when the start is refused, with the reason", async () => {
    const app = renderApp({ slowStart: true, startError: "No claude." });
    await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
    const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
    await app.user.click(await within(dialog).findByRole("button", { name: /^Developer/ }));
    await app.chats.releaseStart();
    expect((await within(dialog).findByRole("alert")).textContent).toBe("No claude.");
    expect(within(dialog).queryByRole("status")).toBeNull();
    expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: /^Developer/ }).disabled).toBe(false);
  });
});
