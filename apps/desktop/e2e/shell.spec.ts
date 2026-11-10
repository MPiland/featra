import { expect, test, type ElectronApplication } from "@playwright/test";
import { clickTray, launch, notices, tempUserData, windowVisible } from "./app.ts";

const zoomFactor = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor());
const ENTRIES = ["Work", "Inbox", "Artifacts", "Plugins", "Settings"];

/**
 * STORY-18 journey: the window, its title bar and sidebar, the app menu by keyboard, and a collapsed sidebar and
 * zoom surviving a restart; closing to the tray and reopening from it.
 */
test("app window: title bar, menu, sidebar; close to tray and reopen; Ctrl+B collapse and zoom survive restart", async () => {
  const profile = await tempUserData();
  try {
    let { app, page } = await launch(profile.dir);
    const bar = page.getByRole("banner");
    const sidebar = page.getByRole("navigation", { name: "Featra" });
    const toggle = bar.getByRole("button", { name: "Toggle sidebar" });

    // Title bar: menu, toggle, back, forward and the current view's title.
    for (const name of ["Menu", "Toggle sidebar", "Back", "Forward"]) {
      await expect(bar.getByRole("button", { name })).toBeVisible();
    }
    await expect(bar.getByRole("heading", { level: 1 })).toHaveText("Work");
    await expect(page).toHaveTitle("Featra · Work");

    // Sidebar: the project switcher (STORY-19), New chat (STORY-5), then every entry, which opens its view.
    await expect(sidebar.getByRole("button")).toHaveText([/No project$/, "New chat", ...ENTRIES]);
    await expect(sidebar.getByRole("button").first()).toHaveAccessibleName("Switch project: No project");
    await sidebar.getByRole("button", { name: "Inbox" }).click();
    await expect(bar.getByRole("heading", { level: 1 })).toHaveText("Inbox");
    await bar.getByRole("button", { name: "Back" }).click();
    await expect(bar.getByRole("heading", { level: 1 })).toHaveText("Work");

    // Menu by keyboard: open it, walk to View, into its submenu, and zoom in.
    await bar.getByRole("button", { name: "Menu" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "File" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "View" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    const viewMenu = page.getByRole("menu", { name: "View" });
    await expect(viewMenu).toBeVisible();
    await expect(viewMenu.getByRole("menuitemcheckbox", { name: /^Sidebar/ })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(viewMenu.getByRole("menuitem", { name: /^Zoom In/ })).toBeFocused();
    await expect(viewMenu.getByRole("menuitem", { name: /^Zoom In/ })).toContainText("Ctrl+=");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect.poll(() => zoomFactor(app)).toBe(1.1);

    // Close sends it to the tray with a one-time notice; the tray icon brings the same window back.
    await bar.getByRole("button", { name: "Close window" }).click();
    await expect.poll(() => windowVisible(app)).toBe(false);
    expect(await notices(app)).toEqual(["Featra is still running in the system tray"]);
    await clickTray(app);
    await expect.poll(() => windowVisible(app)).toBe(true);
    await expect.poll(() => zoomFactor(app)).toBe(1.1);

    // Ctrl+B collapses it: zero width and out of the tab order.
    await page.keyboard.press("Control+B");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBe(0);
    await page.getByRole("button", { name: "Menu" }).focus();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await sidebar.evaluate((nav) => nav.contains(document.activeElement))).toBe(false);
    }

    // Restart: still collapsed.
    await app.close();
    ({ app, page } = await launch(profile.dir));
    const toggle2 = page.getByRole("banner").getByRole("button", { name: "Toggle sidebar" });
    await expect(toggle2).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => zoomFactor(app)).toBe(1.1);
    const sidebar2 = page.getByRole("navigation", { name: "Featra", includeHidden: true });
    expect((await sidebar2.boundingBox())?.width ?? 0).toBe(0);

    // The toggle brings it back.
    await toggle2.click();
    await expect(page.getByRole("navigation", { name: "Featra" }).getByRole("button")).toHaveText([
      /No project$/,
      "New chat",
      ...ENTRIES,
    ]);
    await app.close();
  } finally {
    await profile.dispose();
  }
});
