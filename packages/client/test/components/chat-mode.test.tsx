/**
 * STORY-6 AC5 to AC7 in the chat views, through the real App: the picker and the chat header name the mode the way
 * the provider does and say where it came from, full access carries a warning mark, and a role's note shows once.
 * The host's server is faked (chat-server.ts); the mode and note are what the real server sends (proved in packages/server).
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FULL_ACCESS_WARNING, type ModeInfo } from "@featra/work-format/modes";
import { BUILT_IN_ROLES } from "@featra/work-format/roles";
import { CHAT_COPY } from "../../src/chats.ts";
import { renderApp } from "../harness.tsx";

afterEach(cleanup);

const AUTO: ModeInfo = { provider: "claude", name: "auto", level: "user", fullAccess: false };
const FULL: ModeInfo = { provider: "claude", name: "bypassPermissions", level: "local", fullAccess: true };

async function startChat(opts: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp(opts);
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  await app.user.click(await screen.findByRole("button", { name: /^QA/ }));
  return { ...app, chat: await screen.findByRole("region", { name: "QA" }) };
}

describe("AC7: the picker and the chat name the provider's mode and its source", () => {
  it("shows the mode a role starts in on its row in the picker", async () => {
    const roles = BUILT_IN_ROLES.map((r) => Object.assign({}, r, { mode: AUTO }));
    const { user } = renderApp({ roles });
    await user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
    const list = await screen.findByRole("list", { name: CHAT_COPY.roles });
    await expect.poll(() => within(list).queryAllByRole("button").length).toBe(5);
    for (const b of within(list).getAllByRole("button"))
      expect(b.textContent).toMatch(/ · auto · from Claude settings$/);
  });

  it("shows the chat's mode in its header, with where it is set, and no warning for a mode that asks", async () => {
    const { chat } = await startChat({ chatMode: AUTO });
    const mode = within(chat).getByText("auto · from Claude settings");
    expect(mode.getAttribute("title")).toBe("Set in Claude's user settings");
    expect(within(chat).queryByText(FULL_ACCESS_WARNING, { exact: false })).toBeNull();
  });

  it("starts in Ask when no setting names a mode", async () => {
    const { chat } = await startChat();
    expect(within(chat).getByText(CHAT_COPY.ask)).toBeTruthy();
    expect(within(chat).queryByRole("status")).toBeNull();
  });
});

describe("AC6: full access is honoured and marked in the composer", () => {
  it("shows the warning beside the message box", async () => {
    const { chat } = await startChat({ chatMode: FULL });
    expect(within(chat).getByText("bypassPermissions · from Claude settings").getAttribute("title")).toBe(
      "Set in Claude's local project settings",
    );
    const warning = within(chat).getByRole("status");
    expect(warning.textContent).toContain(FULL_ACCESS_WARNING);
    expect(warning.closest("form")).toBe(
      within(chat).getByRole("textbox", { name: CHAT_COPY.composer }).closest("form"),
    );
  });
});

describe("AC5: a role adjusted to run says so in one line", () => {
  it("shows the note under the header", async () => {
    const note = "Claude doesn't have the model \"gpt-5\": using Claude's default.";
    const { chat } = await startChat({ chatNote: note });
    expect(within(chat).getByText(note)).toBeTruthy();
  });

  it("shows no note otherwise", async () => {
    const { chat } = await startChat();
    expect(chat.querySelector(".chat-note")).toBeNull();
  });
});
