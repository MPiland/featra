/**
 * STORY-21: the sidebar's chat list, New Chat from the File menu and Ctrl+N, through the real App. The host's server
 * is faked (chat-server.ts): it keeps each chat's row with work-format's real rules and pushes the list.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_COPY } from "../../src/chats.ts";
import { CLAUDE_INSTALLED } from "../chat-server.ts";
import { renderApp, viewTitle } from "../harness.tsx";
import { item, labels, menuAt, openPath } from "../menu-harness.ts";

afterEach(cleanup);

type App = ReturnType<typeof renderApp>;

const chatsSection = () => screen.getByRole("region", { name: CHAT_COPY.chats });
const group = (name: string) => within(chatsSection()).getByRole("group", { name });
const rows = () => Array.from(chatsSection().querySelectorAll<HTMLElement>(".chat-row"));
const rowTitles = () => rows().map((r) => r.querySelector(".chat-row-title")?.textContent);
const row = (title: string) => rows().find((r) => r.querySelector(".chat-row-title")?.textContent === title)!;
const composer = () => screen.getByRole("textbox", { name: CHAT_COPY.composer });
const dialog = () => screen.findByRole("dialog", { name: CHAT_COPY.newChat });

/** Picks `role` in the open New chat dialog and waits for its chat. */
async function pick(app: App, role: string) {
  await app.user.click(await within(await dialog()).findByRole("button", { name: new RegExp(`^${role}`) }));
  await screen.findByRole("region", { name: role });
}

async function startFromKeys(app: App, role: string) {
  await app.user.keyboard("{Control>}n{/Control}");
  await pick(app, role);
}

describe("AC1: New chat starts a plain chat", () => {
  it("adds the chat to the list under its role's name, and its first message names it", async () => {
    const app = renderApp();
    await startFromKeys(app, "Developer");
    await expect.poll(rowTitles).toEqual(["Developer"]);
    expect(row("Developer").getAttribute("aria-current")).toBe("page");
    await app.user.type(composer(), "Fix the login bug{Enter}");
    expect(rowTitles()).toEqual(["Fix the login bug"]);
    expect(screen.queryByRole("button", { name: /feature/i })).toBeNull();
  });
});

describe("AC2: chats grouped by the providers the user has installed", () => {
  it("shows a group for each installed provider, by the name the server gives it, newest chat first", async () => {
    const app = renderApp();
    expect(await within(chatsSection()).findByRole("heading", { name: "Claude Code" })).toBeTruthy();
    await startFromKeys(app, "Developer");
    await startFromKeys(app, "QA");
    await expect.poll(rowTitles).toEqual(["QA", "Developer"]);
    expect(within(group("Claude Code")).getAllByRole("button")).toHaveLength(2);
  });

  it("shows no group for a provider that isn't installed", async () => {
    renderApp({ providers: [{ ...CLAUDE_INSTALLED, installed: false }] });
    await Promise.resolve();
    expect(within(chatsSection()).queryByRole("group")).toBeNull();
  });

  it("shows another provider by its own name: nothing is named Claude in the client", async () => {
    renderApp({ providers: [{ ...CLAUDE_INSTALLED, name: "Another Agent" }] });
    expect(await within(chatsSection()).findByRole("heading", { name: "Another Agent" })).toBeTruthy();
  });

  it("has no chats without a project", () => {
    renderApp({ project: null });
    expect(rows()).toEqual([]);
  });
});

describe("AC3: a chat waiting on the user shows a dot", () => {
  it("shows the dot once the agent's turn ends, and clears it when the user replies", async () => {
    const app = renderApp();
    await startFromKeys(app, "Developer");
    await app.user.type(composer(), "hello{Enter}");
    expect(row("hello").querySelector(".chat-dot")).toBeNull();
    app.chats.emit("chat-1", { type: "text", block: "m1:0", delta: "Hi" }, { type: "turn-end", outcome: "done" });
    const dot = row("hello").querySelector(".chat-dot")!;
    expect(dot.getAttribute("data-waiting")).toBe("reply");
    expect(dot.textContent).toBe(CHAT_COPY.waiting);
    await app.user.type(composer(), "more{Enter}");
    expect(row("hello").querySelector(".chat-dot")).toBeNull();
  });

  it("shows no dot after the user stops the turn", async () => {
    const app = renderApp();
    await startFromKeys(app, "Developer");
    await app.user.type(composer(), "slow{Enter}");
    app.chats.emit("chat-1", { type: "turn-end", outcome: "stopped" });
    expect(row("slow").querySelector(".chat-dot")).toBeNull();
  });
});

describe("selecting a chat opens it", () => {
  it("opens the chat clicked, and Back and Forward move between chats and views", async () => {
    const app = renderApp();
    await startFromKeys(app, "Developer");
    await startFromKeys(app, "QA");
    await expect.poll(rowTitles).toEqual(["QA", "Developer"]);
    await app.user.click(screen.getByRole("button", { name: "Work" }));
    expect(viewTitle().textContent).toBe("Work");

    await app.user.click(row("Developer"));
    expect(screen.getByRole("region", { name: "Developer" })).toBeTruthy();
    expect(viewTitle().textContent).toBe("Developer");
    expect(row("Developer").getAttribute("aria-current")).toBe("page");
    expect(row("QA").getAttribute("aria-current")).toBeNull();

    // The chat's own header is a banner too; Back and Forward are the title bar's alone.
    const back = screen.getByRole("button", { name: "Back" });
    await app.user.click(back);
    expect(viewTitle().textContent).toBe("Work");
    await app.user.click(back);
    expect(screen.getByRole("region", { name: "QA" })).toBeTruthy();
    await app.user.click(screen.getByRole("button", { name: "Forward" }));
    expect(viewTitle().textContent).toBe("Work");
  });
});

describe("AC4: File > New Chat (Ctrl+N, ⌘N on macOS)", () => {
  it("is the File menu's first item, and opens New chat", async () => {
    const app = renderApp();
    await openPath(app.user, "File");
    expect(labels(menuAt(1))[0]).toBe("New ChatCtrl+N");
    await app.user.click(item(/^New Chat/));
    await pick(app, "QA");
    expect(app.calls).toContain("chat.start:/home/me/manager:qa");
  });

  it("opens New chat on ⌘N on macOS", async () => {
    const app = renderApp({ platform: "darwin" });
    await app.user.keyboard("{Meta>}n{/Meta}");
    expect(await dialog()).toBeTruthy();
  });

  it("opens Work without a project, where the user can open one", async () => {
    const app = renderApp({ project: null });
    await app.user.keyboard("{Control>},{/Control}");
    expect(viewTitle().textContent).toBe("Settings");
    await app.user.keyboard("{Control>}n{/Control}");
    expect(viewTitle().textContent).toBe("Work");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is left out in a browser tab, where Ctrl+N stays the browser's", async () => {
    const app = renderApp({ platform: "web" });
    await openPath(app.user, "File");
    expect(labels(menuAt(1)).join()).not.toMatch(/New Chat/);
    await app.user.keyboard("{Escape}{Escape}{Control>}n{/Control}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
