import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { launch, tempUserData } from "./app.ts";
import { luminance, parseCssColor } from "./contrast.ts";

/** AC5 in the real app: what each menu item does to the window. Only the OS (theme, storage, clipboard) is faked. */

const zoomFactor = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor());
const themeSource = (app: ElectronApplication) => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
const bodyLuminance = async (page: Page) =>
  luminance(parseCssColor(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)));

async function choose(page: Page, ...path: string[]) {
  await page.getByRole("button", { name: "Menu" }).click();
  const last = path.pop()!;
  for (const name of path) await page.getByRole("menuitem", { name, exact: true }).hover();
  await page
    .locator("[role=menuitem], [role=menuitemradio]")
    .filter({ hasText: new RegExp(`^${last}`) })
    .click();
}

test.describe("AC5: app menu", () => {
  test("zoom changes the window's zoom factor and survives a restart", async () => {
    const profile = await tempUserData();
    try {
      let { app, page } = await launch(profile.dir);
      expect(await zoomFactor(app)).toBe(1);
      await choose(page, "View", "Zoom in");
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
      await choose(page, "View", "Reset zoom");
      await expect.poll(() => zoomFactor(app)).toBe(1);
      await page.keyboard.press("Control+=");
      await page.keyboard.press("Control+0");
      await expect.poll(() => zoomFactor(app)).toBe(1);
      await app.close();
    } finally {
      await profile.dispose();
    }
  });

  test("an explicit theme overrides the OS, survives a restart, and System follows the OS again", async () => {
    const profile = await tempUserData();
    try {
      let { app, page } = await launch(profile.dir);
      await page.emulateMedia({ colorScheme: "light" });
      expect(await bodyLuminance(page)).toBeGreaterThan(0.85);

      await choose(page, "View", "Theme", "Dark");
      await expect.poll(() => bodyLuminance(page)).toBeLessThan(0.05);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
      expect(await themeSource(app)).toBe("dark");

      await app.close();
      ({ app, page } = await launch(profile.dir));
      await page.emulateMedia({ colorScheme: "light" });
      expect(await bodyLuminance(page)).toBeLessThan(0.05);
      expect(await themeSource(app)).toBe("dark");

      await page.emulateMedia({ colorScheme: "dark" });
      await choose(page, "View", "Theme", "Light");
      await expect.poll(() => bodyLuminance(page)).toBeGreaterThan(0.85);
      expect(await themeSource(app)).toBe("light");

      await choose(page, "View", "Theme", "System");
      await expect.poll(() => bodyLuminance(page)).toBeLessThan(0.05); // the (emulated) OS is dark
      expect(await themeSource(app)).toBe("system");
      await page.emulateMedia({ colorScheme: "light" });
      await expect.poll(() => bodyLuminance(page)).toBeGreaterThan(0.85);
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

      await choose(page, "Edit", "Select all");
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

      await choose(page, "Edit", "Select all");
      await choose(page, "Edit", "Copy");
      await field.press("End");
      await choose(page, "Edit", "Paste");
      await expect(field).toHaveValue("hello menuhello menu");
    } finally {
      await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), savedClipboard);
      await app.close();
      await profile.dispose();
    }
  });

  test("About opens as a dialog; Troubleshooting reloads the window", async () => {
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
      await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Inbox" }).click();
      await expect(page.getByRole("button", { name: "Back" })).toBeEnabled();
      await choose(page, "Help", "Troubleshooting", "Reload window");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Work");
      await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();

      await choose(page, "Help", "Troubleshooting", "Toggle developer tools");
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.isDevToolsOpened()))
        .toBe(true);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });
});
