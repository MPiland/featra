import { expect, test, type Page } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-21: the sidebar's chat list in the real app with its real local server. Only the platform and the agent are
 * faked (agent.ts): a stand-in `claude` on the PATH, and fake-agent-sdk.mjs as the Agent SDK's `query`.
 */
const chats = (page: Page) => page.getByRole("region", { name: "Chats" });
const rows = (page: Page) => chats(page).locator(".chat-row");
const row = (page: Page, title: string) =>
  rows(page).filter({ has: page.locator(".chat-row-title", { hasText: new RegExp(`^${title}$`) }) });

async function pick(page: Page, role: string) {
  await page
    .getByRole("dialog", { name: "New chat" })
    .getByRole("button", { name: new RegExp(`^${role}`) })
    .click();
  await expect(page.getByRole("region", { name: role })).toBeVisible();
}

test("New Chat from the keyboard and the File menu, the list grouped by provider, the waiting dot, and reopening a chat", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    [PATH_KEY]: bin.path,
  });
  try {
    // AC2: one group for the installed provider, named by the server.
    await expect(chats(page).getByRole("group", { name: "Claude Code" })).toBeVisible();

    // AC4 and AC1: Ctrl+N opens New chat; the chat is a row of its own, named by its first message.
    await page.keyboard.press("Control+N");
    await pick(page, "Developer");
    await expect(row(page, "Developer")).toHaveAttribute("aria-current", "page");
    const composer = page.getByRole("textbox", { name: "Message" });
    await composer.fill("hello");
    await composer.press("Enter");
    await expect(page.getByRole("log", { name: "Chat" })).toContainText("You said: hello");

    // AC3: the agent's turn ended, so the chat waits on the user.
    await expect(row(page, "hello").locator(".chat-dot")).toHaveAttribute("data-waiting", "reply");

    // AC4: File > New Chat, the menu's first item.
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("menuitem", { name: "File", exact: true }).hover();
    await page.getByRole("menuitem", { name: /^New Chat/ }).click();
    await pick(page, "QA");
    await expect(rows(page).locator(".chat-row-title")).toHaveText(["QA", "hello"]);
    await expect(row(page, "QA").locator(".chat-dot")).toHaveCount(0);

    // Selecting a chat opens it, with its transcript.
    await row(page, "hello").click();
    await expect(page.getByRole("region", { name: "Developer" })).toBeVisible();
    await expect(page.getByRole("log", { name: "Chat" })).toContainText("You said: hello");
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
  }
});
