import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { clickLastNotification, launch, notificationsShown, setFocused, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-7: the question inbox and desktop notifications, in the real app with its real local server and clock. Only the
 * platform and the agent are faked: the agent (fake-agent-sdk.mjs), Electron's Notification and window focus
 * (featraTest), and the wait, which settings.json holds as 3 seconds so the test waits for the real server clock to
 * pass it instead of faking it.
 */
const SOON = 5000;
const log = (page: Page) => page.getByRole("log", { name: "Chat" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const inboxEntry = (page: Page) => page.getByRole("button", { name: /^Inbox/ });
const waiting = (page: Page) => page.getByRole("region", { name: "Waiting for you" });

test("an approval left unanswered reaches the Inbox with a count and a notification, is answered there once, and the notification opens its chat", async () => {
  const userData = await tempUserData();
  await writeFile(join(userData.dir, "settings.json"), JSON.stringify({ inboxWaitMinutes: 0.05 }), "utf8");
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    [PATH_KEY]: bin.path,
  });
  const newDeveloperChat = async () => {
    await page.getByRole("button", { name: "New chat" }).click();
    await page
      .getByRole("dialog", { name: "New chat" })
      .getByRole("button", { name: /^Developer/ })
      .click();
  };
  try {
    await setFocused(app, false);
    await newDeveloperChat();
    await expect(page.getByRole("region", { name: "Developer" })).toBeVisible();

    // AC3: it asks; Featra isn't focused, so a notification fires at once, before the wait.
    await composer(page).fill("use a tool");
    await composer(page).press("Enter");
    await expect
      .poll(() => notificationsShown(app))
      .toEqual([{ title: "Featra", body: expect.stringContaining("approve Bash") }]);
    await expect(inboxEntry(page)).toHaveText("Inbox");

    // AC1, AC4: once it has waited, it is in the Inbox, and the sidebar counts it.
    await expect(inboxEntry(page)).toContainText("1", { timeout: SOON * 3 });
    await inboxEntry(page).click();
    const item = waiting(page).getByRole("listitem");
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('"command": "npm test"');

    // AC2: answering in the Inbox answers it once: the chat goes on, and the Inbox and the count clear.
    await item.getByRole("button", { name: "Allow", exact: true }).click();
    await expect(page.getByText("Nothing is waiting for you.")).toBeVisible();
    await expect(inboxEntry(page)).toHaveText("Inbox");

    // AC3: a second request notifies again; clicking that notification opens its chat.
    await newDeveloperChat();
    await composer(page).fill("use a tool");
    await composer(page).press("Enter");
    await expect.poll(async () => (await notificationsShown(app)).length).toBe(2);
    await inboxEntry(page).click();
    await expect(log(page)).toHaveCount(0);
    await clickLastNotification(app);
    await expect(log(page).getByRole("group", { name: "Approve Bash" })).toBeVisible();
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
  }
});
