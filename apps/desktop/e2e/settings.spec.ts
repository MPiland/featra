import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { closeFromOs, exited, launch, tempProject, tempUserData, trayExists, windowVisible } from "./app.ts";

/**
 * STORY-20: Settings, in the real app. Only the platform is faked: the userData and project folders are temporary,
 * and FEATRA_E2E_TRAY says whether the desktop has a tray.
 */
const settingsFile = (dir: string) => join(dir, "settings.json");
const readSettings = async (dir: string) => JSON.parse(await readFile(settingsFile(dir), "utf8"));
const dataTheme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? "system");
const pages = (page: Page) => page.getByRole("navigation", { name: "Settings pages" });

/** Presses Tab until `target` has focus: how a keyboard user reaches it. */
async function tabTo(page: Page, target: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached ${target}`);
}

async function chooseFromMenu(page: Page, ...path: string[]) {
  await page.getByRole("button", { name: "Menu" }).click();
  const last = path.pop()!;
  for (const name of path) await page.getByRole("menuitem", { name, exact: true }).hover();
  await page.locator("[role=menuitem]").filter({ hasText: new RegExp(`^${last}`) }).click();
}

test.describe("STORY-20: Settings", () => {
  test("keyboard only: Ctrl+, opens Settings, the theme changes from the keyboard and survives a restart (AC4, AC5, AC8)", async () => {
    const profile = await tempUserData();
    try {
      let { app, page } = await launch(profile.dir);
      await page.keyboard.press("Control+,");
      await expect(pages(page)).toBeVisible();
      await expect(page.getByRole("heading", { name: "General", level: 2 })).toBeVisible();
      expect(await dataTheme(page)).toBe("system");

      await tabTo(page, pages(page).getByRole("button", { name: "Appearance" }));
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Appearance", level: 2 })).toBeVisible();
      const theme = page.getByRole("radiogroup", { name: "Theme" });
      await expect(theme.getByRole("radio", { name: "System" })).toBeChecked();
      await tabTo(page, theme.getByRole("radio", { name: "System" }));
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect(theme.getByRole("radio", { name: "Dark" })).toBeChecked();
      await expect.poll(() => dataTheme(page)).toBe("dark");
      await expect.poll(async () => (await readSettings(profile.dir)).theme).toBe("dark");
      await app.close();

      ({ app, page } = await launch(profile.dir));
      expect(await dataTheme(page)).toBe("dark");
      expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe("dark");
      await chooseFromMenu(page, "File", "Settings");
      await pages(page).getByRole("button", { name: "Appearance" }).click();
      await expect(page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Dark" })).toBeChecked();
      await app.close();
    } finally {
      await profile.dispose();
    }
  });

  test("the Close button setting applies at once: Quit removes the tray and close quits; back to the tray, close hides (AC6)", async () => {
    const profile = await tempUserData();
    try {
      const { app, page } = await launch(profile.dir);
      await page.keyboard.press("Control+,");
      const close = page.getByRole("radiogroup", { name: "Close button" });
      await expect(close.getByRole("radio", { name: "Keep running in the tray" })).toBeChecked();
      expect(await trayExists(app)).toBe(true);

      await close.getByRole("radio", { name: "Quit Featra" }).check();
      await expect.poll(() => trayExists(app)).toBe(false);
      await expect.poll(async () => (await readSettings(profile.dir)).closeButton).toBe("quit");

      await close.getByRole("radio", { name: "Keep running in the tray" }).check();
      await expect.poll(() => trayExists(app)).toBe(true);
      await closeFromOs(app);
      await expect.poll(() => windowVisible(app)).toBe(false);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.show());

      await close.getByRole("radio", { name: "Quit Featra" }).check();
      await expect.poll(() => trayExists(app)).toBe(false);
      const gone = exited(app);
      await closeFromOs(app);
      expect(await gone).toBe(0);
    } finally {
      await profile.dispose();
    }
  });

  test("with no tray, the Close button shows Quit, disabled, and says why (AC6)", async () => {
    test.skip(process.platform === "darwin", "macOS always has the Dock");
    const profile = await tempUserData();
    try {
      const { app, page } = await launch(profile.dir, { FEATRA_E2E_TRAY: "absent" });
      await page.keyboard.press("Control+,");
      const close = page.getByRole("radiogroup", { name: "Close button" });
      await expect(close.getByRole("radio", { name: "Quit Featra" })).toBeChecked();
      await expect(close.getByRole("radio", { name: "Quit Featra" })).toBeDisabled();
      await expect(close.getByRole("radio", { name: "Keep running in the tray" })).toBeDisabled();
      await expect(close).toHaveAccessibleDescription(/no system tray, so closing always quits Featra/);
      await app.close();
    } finally {
      await profile.dispose();
    }
  });

  test("a project override is written to .featra/config.yaml, labelled, and reset (AC1, AC2, AC3)", async () => {
    const profile = await tempUserData();
    const before = "# Featra project settings\nversion: 1\nbaseBranch: main\n";
    const project = await tempProject(before);
    try {
      const { app, page } = await launch(profile.dir, { FEATRA_PROJECT_DIR: project.dir });
      await page.keyboard.press("Control+,");
      await pages(page).getByRole("list", { name: "Project" }).getByRole("button", { name: "Workflow" }).click();
      const name = project.dir.split(/[\\/]/).at(-1)!;
      const picker = page.getByRole("button", { name: `Project: ${name}` });
      await picker.click();
      await expect(page.getByRole("listbox", { name: "Project" }).getByRole("option")).toHaveText([name]);
      await page.keyboard.press("Escape");
      await expect(picker).toBeFocused();

      const progress = page.getByRole("radiogroup", { name: "Feature progress counts" });
      const row = page.locator(".setting-row").filter({ has: progress });
      await expect(progress).not.toHaveAccessibleDescription(/App default|Overridden/);
      await progress.getByRole("radio", { name: "Tasks" }).check();
      await expect(row.getByText(/^Overridden/)).toBeVisible();
      await expect(progress).toHaveAccessibleDescription(/Overridden\s*\. App default: Stories/);
      expect(await readFile(project.config, "utf8")).toBe(`${before}progress: tasks\n`);

      await row.getByRole("button", { name: "Reset Feature progress counts to the app default" }).click();
      await expect(row.getByText(/^Overridden/)).toHaveCount(0);
      await expect(progress.getByRole("radio", { name: "Stories" })).toBeChecked();
      await expect(progress.getByRole("radio", { name: "Stories" })).toBeFocused();
      expect(await readFile(project.config, "utf8")).toBe(before);
      // App settings stayed in the user's config folder; the project's file never held them.
      await expect.poll(() => readFile(settingsFile(profile.dir), "utf8").catch(() => "")).not.toMatch(/progress.*tasks/);
      await app.close();
    } finally {
      await profile.dispose();
      await project.dispose();
    }
  });

  test("Ctrl+/ and Help > Keyboard Shortcuts open the shortcuts page, listed by area and searchable (AC7)", async () => {
    const profile = await tempUserData();
    try {
      const { app, page } = await launch(profile.dir);
      await page.keyboard.press("Control+/");
      await expect(page.getByRole("heading", { name: "Keyboard shortcuts", level: 2 })).toBeVisible();
      const file = page.getByRole("table", { name: "File" });
      await expect(file.getByRole("row", { name: /^Settings Ctrl\+,$/ })).toBeVisible();
      await expect(page.getByRole("table", { name: "View" })).toBeVisible();

      const search = page.getByRole("searchbox", { name: "Search shortcuts" });
      await search.fill("zoom in");
      await expect(page.getByRole("table")).toHaveCount(1);
      await expect(page.getByRole("table", { name: "View" }).getByRole("row")).toHaveCount(1);
      await search.fill("nothing like this");
      await expect(page.getByRole("table")).toHaveCount(0);
      await expect(page.getByRole("status").filter({ hasText: "No shortcuts match" })).toBeVisible();

      await pages(page).getByRole("button", { name: "Appearance" }).click();
      await chooseFromMenu(page, "Help", "Keyboard Shortcuts");
      await expect(page.getByRole("heading", { name: "Keyboard shortcuts", level: 2 })).toBeVisible();
      await app.close();
    } finally {
      await profile.dispose();
    }
  });
});
