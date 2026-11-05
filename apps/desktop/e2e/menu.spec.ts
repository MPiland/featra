import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { clickTray, closeFromOs, exited, launch, notices, shownInFolder, tempUserData, windowVisible } from "./app.ts";

/**
 * AC5 in the real app: what each menu item and its shortcut do to the window. Only the OS is faked (the storage
 * folder, File Explorer, and the relaunch after a restart, which the test does itself).
 */

const zoomFactor = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor());
const fullScreen = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen());
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const logFile = (userData: string) => join(userData, "logs", "main.log");
/** A click that restarts the app can only report that the page went away. */
const lastClick = (e: Error) => {
  if (!/has been closed/.test(e.message)) throw e;
};

async function choose(page: Page, ...path: string[]) {
  await page.getByRole("button", { name: "Menu" }).click();
  const last = path.pop()!;
  for (const name of path) await page.getByRole("menuitem", { name, exact: true }).hover();
  await page
    .locator("[role=menuitem], [role=menuitemcheckbox]")
    .filter({ hasText: new RegExp(`^${last}`) })
    .click();
}

test.describe("AC5: app menu", () => {
  test("zoom changes the window's zoom factor and survives a restart", async () => {
    const profile = await tempUserData();
    try {
      let { app, page } = await launch(profile.dir);
      expect(await zoomFactor(app)).toBe(1);
      await choose(page, "View", "Zoom In");
      await expect.poll(() => zoomFactor(app)).toBe(1.1);
      await page.keyboard.press("Control+=");
      await expect.poll(() => zoomFactor(app)).toBe(1.25);
      await page.keyboard.press("Control+-");
      await page.keyboard.press("Control+-");
      await page.keyboard.press("Control+-");
      await expect.poll(() => zoomFactor(app)).toBe(0.9);
      await page.keyboard.press("Control+=");
      await page.keyboard.press("Control+=");
      await page.keyboard.press("Control+=");
      await expect.poll(() => zoomFactor(app)).toBe(1.25);

      await app.close();
      ({ app, page } = await launch(profile.dir));
      await expect.poll(() => zoomFactor(app)).toBe(1.25);
      await choose(page, "View", "Actual Size");
      await expect.poll(() => zoomFactor(app)).toBe(1);
      await page.keyboard.press("Control+=");
      await page.keyboard.press("Control+0");
      await expect.poll(() => zoomFactor(app)).toBe(1);
      await app.close();
    } finally {
      await profile.dispose();
    }
  });

  test("Edit items act on the focused field", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    const savedClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
    try {
      // A field to edit: later stories bring the app's own (chat input, settings); the test adds one.
      await page.evaluate(() => {
        const input = document.createElement("input");
        input.setAttribute("aria-label", "Test field");
        document.querySelector("main")!.append(input);
      });
      const field = page.getByRole("textbox", { name: "Test field" });
      await field.click();
      await page.keyboard.type("hello menu");

      await choose(page, "Edit", "Select All");
      await expect(field).toBeFocused();
      expect(await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 10]);

      await choose(page, "Edit", "Cut");
      await expect(field).toHaveValue("");
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("hello menu");

      await choose(page, "Edit", "Paste");
      await expect(field).toHaveValue("hello menu");

      await choose(page, "Edit", "Undo");
      await expect(field).toHaveValue("");
      await choose(page, "Edit", "Redo");
      await expect(field).toHaveValue("hello menu");

      await choose(page, "Edit", "Select All");
      await choose(page, "Edit", "Copy");
      await field.press("End");
      await choose(page, "Edit", "Paste");
      await expect(field).toHaveValue("hello menuhello menu");

      await field.press("Shift+Home");
      await choose(page, "Edit", "Delete");
      await expect(field).toHaveValue("");
    } finally {
      await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), savedClipboard);
      await app.close();
      await profile.dispose();
    }
  });

  test("About opens as a dialog; Reload and F5 reload the window; Troubleshooting toggles developer tools", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      await choose(page, "Help", "About Featra");
      const about = page.getByRole("dialog", { name: "About Featra" });
      const version = await app.evaluate(({ app: electronApp }) => electronApp.getVersion());
      await expect(about).toContainText(`Version ${version}`);
      await expect(about).toContainText("MIT licence");
      await about.getByRole("button", { name: "Close" }).click();

      // Reload: state that lives only in the page (the Back history) is gone afterwards.
      const sidebar = page.getByRole("navigation", { name: "Featra" });
      await sidebar.getByRole("button", { name: "Inbox" }).click();
      await expect(page.getByRole("button", { name: "Back" })).toBeEnabled();
      await choose(page, "View", "Reload");
      await expect(heading(page)).toHaveText("Work");
      await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();
      await sidebar.getByRole("button", { name: "Inbox" }).click();
      await page.keyboard.press("F5");
      await expect(heading(page)).toHaveText("Work");
      await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();

      await choose(page, "Help", "Troubleshooting", "Toggle Developer Tools");
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.isDevToolsOpened()))
        .toBe(true);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("Full Screen and F11 toggle full screen", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      expect(await fullScreen(app)).toBe(false);
      await choose(page, "View", "Full Screen");
      await expect.poll(() => fullScreen(app)).toBe(true);
      await page.keyboard.press("F11");
      await expect.poll(() => fullScreen(app)).toBe(false);
      await page.keyboard.press("F11");
      await expect.poll(() => fullScreen(app)).toBe(true);
      await choose(page, "View", "Full Screen");
      await expect.poll(() => fullScreen(app)).toBe(false);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("Go opens views; Back and Forward work from the menu and from Alt+Left and Alt+Right", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("menuitem", { name: "Go", exact: true }).hover();
      await expect(page.getByRole("menuitem", { name: /^Back/ })).toHaveAttribute("aria-disabled", "true");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");

      await choose(page, "Go", "Inbox");
      await expect(heading(page)).toHaveText("Inbox");
      await choose(page, "Go", "Plugins");
      await expect(heading(page)).toHaveText("Plugins");
      await choose(page, "Go", "Back");
      await expect(heading(page)).toHaveText("Inbox");
      await choose(page, "Go", "Forward");
      await expect(heading(page)).toHaveText("Plugins");
      await page.keyboard.press("Alt+ArrowLeft");
      await expect(heading(page)).toHaveText("Inbox");
      await page.keyboard.press("Alt+ArrowLeft");
      await expect(heading(page)).toHaveText("Work");
      await page.keyboard.press("Alt+ArrowRight");
      await expect(heading(page)).toHaveText("Inbox");
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("Show Logs opens the real log file in the platform's file manager", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      // "…in File Explorer" on Windows, "…in File Manager" on Linux (the label is unit-tested per platform).
      await choose(page, "Help", "Troubleshooting", "Show Logs in ");
      await expect.poll(() => shownInFolder(app)).toEqual([logFile(profile.dir)]);
      expect(await readFile(logFile(profile.dir), "utf8")).toMatch(new RegExp(String.raw`^\S+ Featra \S+ started \(${process.platform}\)\n`));
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("Clear Cache and Restart restarts and keeps stored settings", async () => {
    const profile = await tempUserData();
    try {
      let { app, page } = await launch(profile.dir);
      await page.keyboard.press("Control+=");
      await expect.poll(() => zoomFactor(app)).toBe(1.1);
      const exit = exited(app);
      await choose(page, "Help", "Troubleshooting", "Clear Cache and Restart").catch(lastClick);
      expect(await exit).toBe(0);
      expect(await readFile(logFile(profile.dir), "utf8")).toMatch(/Cache cleared; restarting\n.*Quitting\n$/);

      ({ app, page } = await launch(profile.dir)); // what the relaunch starts
      await expect.poll(() => zoomFactor(app)).toBe(1.1);
      await app.close();
    } finally {
      await profile.dispose();
    }
  });

  test("Reset App Data… asks first, then forgets stored settings and restarts; the log is kept", async () => {
    const profile = await tempUserData();
    try {
      let { app, page } = await launch(profile.dir);
      await page.keyboard.press("Control+=");
      await page.keyboard.press("Control+B");
      await expect.poll(() => zoomFactor(app)).toBe(1.1);
      await closeFromOs(app); // the tray notice is shown and remembered
      await expect.poll(() => windowVisible(app)).toBe(false);
      expect(await notices(app)).toHaveLength(1);
      await clickTray(app);
      await expect.poll(() => windowVisible(app)).toBe(true);

      await choose(page, "Help", "Troubleshooting", "Reset App Data…");
      const dialog = page.getByRole("dialog", { name: "Reset App Data?" });
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toHaveCount(0);
      expect(app.process().exitCode).toBeNull();

      await choose(page, "Help", "Troubleshooting", "Reset App Data…");
      const exit = exited(app);
      await dialog.getByRole("button", { name: "Reset and Restart" }).click().catch(lastClick);
      expect(await exit).toBe(0);
      expect(await readFile(logFile(profile.dir), "utf8")).toMatch(/started[^]*App data reset; restarting\n/);

      ({ app, page } = await launch(profile.dir)); // what the relaunch starts: from the defaults
      await expect.poll(() => zoomFactor(app)).toBe(1);
      await expect(page.getByRole("banner").getByRole("button", { name: "Toggle sidebar" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await closeFromOs(app);
      await expect.poll(() => notices(app)).toHaveLength(1); // the notice shows again
      await app.close();
    } finally {
      await profile.dispose();
    }
  });
});
