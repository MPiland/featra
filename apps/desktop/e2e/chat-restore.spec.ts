import { expect, test, type Page } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-44: a chat comes back after a restart, in the real app with its real local server and the SDK's real session
 * reader. Faked: a stand-in `claude` on the PATH, fake-agent-sdk.mjs as the SDK's `query` (it writes each turn to a
 * session file as Claude does), and the folder those files live in (CLAUDE_CONFIG_DIR).
 */
const rows = (page: Page) => page.getByRole("region", { name: "Chats" }).locator(".chat-row-title");

test("a chat started before a restart is listed after it, shows its transcript, and goes on in the same session", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const claudeHome = await tempDir("featra-claude-home-");
  const env = {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    CLAUDE_CONFIG_DIR: claudeHome.dir,
    [PATH_KEY]: bin.path,
  };
  try {
    const first = await launch(userData.dir, env);
    try {
      await first.page.keyboard.press("Control+N");
      await first.page
        .getByRole("dialog", { name: "New chat" })
        .getByRole("button", { name: /^Developer/ })
        .click();
      const composer = first.page.getByRole("textbox", { name: "Message" });
      await composer.fill("hello");
      await composer.press("Enter");
      await expect(first.page.getByRole("log", { name: "Chat" })).toContainText("You said: hello");
      await expect(rows(first.page)).toHaveText(["hello"]);
    } finally {
      await first.app.close();
    }

    const { app, page } = await launch(userData.dir, env);
    try {
      // AC2: the same chat is listed, and opening it shows its transcript, read from Claude's session file.
      await expect(rows(page)).toHaveText(["hello"]);
      await rows(page)
        .filter({ hasText: /^hello$/ })
        .click();
      const log = page.getByRole("log", { name: "Chat" });
      await expect(log).toContainText("hello");
      await expect(log).toContainText("You said: hello");

      // AC3: a message goes on in the same session, which still has the first prompt.
      const composer = page.getByRole("textbox", { name: "Message" });
      await composer.fill("again");
      await composer.press("Enter");
      await expect(log).toContainText("You said: again, after: hello");
      await expect(rows(page)).toHaveText(["hello"]);
    } finally {
      await app.close();
    }
  } finally {
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
    await claudeHome.dispose();
  }
});
