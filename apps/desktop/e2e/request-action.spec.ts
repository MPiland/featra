import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { expect, test, type Page } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import {
  clickLastNotification,
  copiedText,
  launch,
  notificationsShown,
  queueFolderPicks,
  setFocused,
  tempProject,
  tempUserData,
} from "./app.ts";
import { pressShortcut } from "./keys.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";

/**
 * STORY-68: an agent asks the user to do something, in the real app with its real local server, Featra MCP and clock.
 * Only the platform and the agent are faked: the agent (fake-agent-sdk.mjs, "request_action") calls the real MCP tool;
 * Electron's clipboard, Notification and focus are stood in for (featraTest); the Inbox wait is 3 seconds
 * (settings.json), so the real server clock passes it. The request's last command would leave a marker file if it ran.
 */
const TITLE = "Sign in to the CLI";
const log = (page: Page) => page.getByRole("log", { name: "Chat" });
const card = (page: Page) => log(page).getByRole("group", { name: TITLE });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const inboxEntry = (page: Page) => page.getByRole("button", { name: /^Inbox/ });
const switcher = (page: Page) =>
  page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: /^Switch project: / });
const projectMenu = (page: Page) => page.getByRole("menu", { name: "Projects" });

test("an agent's request is a card the user copies from and answers, in the chat or the Inbox, and the agent gets the answer", async () => {
  const userData = await tempUserData();
  await writeFile(join(userData.dir, "settings.json"), JSON.stringify({ inboxWaitMinutes: 0.05 }), "utf8");
  const busy = await tempProject("version: 1\n");
  const quiet = await tempProject("version: 1\n");
  const marker = join(busy.dir, "action-ran.txt");
  const bin = await standInClaude();
  const busyName = basename(busy.dir);
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: busy.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    FEATRA_E2E_ACTION_MARKER: marker,
    [PATH_KEY]: bin.path,
  });
  const ask = async () => {
    await page.getByRole("button", { name: "New chat" }).click();
    await page
      .getByRole("dialog", { name: "New chat" })
      .getByRole("button", { name: /^Developer/ })
      .click();
    // Typing before the new chat shows would go to the chat still on screen, whose agent has answered already.
    await expect(page.getByRole("region", { name: "Developer" })).toBeVisible();
    await expect(log(page)).not.toContainText("Tool said");
    await composer(page).fill("request_action");
    await composer(page).press("Enter");
  };
  const busyItem = projectMenu(page).getByRole("menuitemradio", { name: new RegExp(`^${busyName}`) });
  try {
    await atReviewSize(app, page);
    await setFocused(app, false);

    // AC1, AC2: the agent's call shows as a card with its steps, a Copy button for each command, Done and Can't do it.
    await ask();
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByRole("listitem")).toHaveCount(3);
    await expect(card(page).getByRole("button", { name: /^Copy the command of step/ })).toHaveCount(2);
    await expect(card(page).getByRole("button", { name: "Done", exact: true })).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Can't do it", exact: true })).toBeVisible();
    // Review S1: the row's head reads Request with the title once, in the card; the agent's own row for the call is hidden.
    await expect(log(page).locator(".chat-tool-name")).toHaveText(["Request"]);
    await expect(log(page).getByText(TITLE, { exact: true })).toHaveCount(1);
    await expect(log(page)).not.toContainText("mcp__featra__request_action");
    await uxShot(page, "feat20-request-chat-card", log(page));

    // AC2, AC6: Copy puts the command on the clipboard, and nothing runs it.
    await card(page).getByRole("button", { name: "Copy the command of step 1" }).click();
    await expect(card(page).getByRole("button", { name: "Copy the command of step 1" })).toHaveText("Copied");
    await expect.poll(() => copiedText(app)).toEqual(["gh auth login"]);

    // AC4: it is told as it arrives, saying what it asks, and reaches the Inbox once it has waited.
    await expect
      .poll(() => notificationsShown(app))
      .toEqual([{ title: "Featra", body: expect.stringContaining(`: ${TITLE}`) }]);
    await expect(inboxEntry(page)).toContainText("1", { timeout: 15_000 });

    // AC5: while it waits, its agent counts as waiting in the switcher.
    await switcher(page).click();
    await expect(busyItem).toHaveAccessibleName(`${busyName}, 1 agent waiting`);
    await page.keyboard.press("Escape");

    // AC3, AC4: answered Done in the Inbox, the agent gets Done as the call's result.
    await inboxEntry(page).click();
    const waiting = page.getByRole("region", { name: "Waiting for you" });
    const item = waiting.getByRole("listitem").filter({ has: page.getByRole("group", { name: TITLE }) });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("Request");
    await uxShot(page, "feat20-request-inbox-item", item);
    await item.getByRole("button", { name: "Copy the command of step 3" }).click();
    await item.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByText("Nothing is waiting for you.")).toBeVisible();
    await expect(inboxEntry(page)).toHaveText("Inbox");
    await clickLastNotification(app);
    await expect(log(page)).toContainText("Tool said: The user says it's done.");

    // AC5: a second request counts from another project, through the switcher's dot and menu.
    await ask();
    await expect(card(page)).toBeVisible();
    await queueFolderPicks(app, quiet.dir);
    await pressShortcut(page, "openFolder");
    await expect(switcher(page)).toHaveAccessibleName(/another project needs you$/);
    await switcher(page).click();
    await expect(busyItem).toHaveAccessibleName(`${busyName}, 1 agent waiting`);
    await page.keyboard.press("Escape");

    // AC3: Can't do it, with the user's reason, is the call's result; the agent no longer waits.
    await expect.poll(async () => (await notificationsShown(app)).length).toBe(2);
    await clickLastNotification(app);
    await card(page).getByRole("textbox", { name: "Reason" }).fill("No admin rights here.");
    await card(page).getByRole("button", { name: "Can't do it", exact: true }).click();
    await expect(log(page)).toContainText("Tool said: The user couldn't do it: No admin rights here.");
    await switcher(page).click();
    await expect(busyItem).toHaveAccessibleName(busyName);
    await page.keyboard.press("Escape");

    // AC6: Featra never ran a command, though both were copied.
    expect(await copiedText(app)).toHaveLength(2);
    expect(existsSync(marker)).toBe(false);
  } finally {
    await app.close();
    await userData.dispose();
    await busy.dispose();
    await quiet.dispose();
    await bin.dispose();
  }
});
