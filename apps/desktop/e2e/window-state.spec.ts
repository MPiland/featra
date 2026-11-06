import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { launch, tempUserData, windowManagerCanMaximize } from "./app.ts";

/**
 * BUG-1 in the real window: the title bar's maximize button, View > Full Screen and the window itself agree on
 * whether the window is maximized or full screen, whoever changed it (the button, F11, the menu or the OS).
 */

type Win = { fullScreen: boolean; maximized: boolean; bounds: { x: number; y: number; width: number; height: number } };
const win = (app: ElectronApplication): Promise<Win> =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    return { fullScreen: w.isFullScreen(), maximized: w.isMaximized(), bounds: w.getBounds() };
  });
/** The window as it is once the window manager has finished placing it (two reads 300 ms apart agree). */
async function settled(app: ElectronApplication): Promise<Win> {
  let last = await win(app);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const now = await win(app);
    if (JSON.stringify(now) === JSON.stringify(last)) return now;
    last = now;
  }
  return last;
}
/** What the OS does on a title-bar double-click, Win+Up or a snap: change the window without asking the page. */
const fromOs = (app: ElectronApplication, change: "maximize" | "unmaximize" | "enterFullScreen" | "leaveFullScreen") =>
  app.evaluate(({ BrowserWindow }, how) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    if (how === "maximize") w.maximize();
    else if (how === "unmaximize") w.unmaximize();
    else w.setFullScreen(how === "enterFullScreen");
  }, change);

const RESTORE = process.platform === "win32" ? "Restore Down" : "Restore";
/** The second of the three window controls: Maximize, Restore (Down) or Exit Full Screen. */
const sizeButton = (page: Page) =>
  page
    .getByRole("banner")
    .getByRole("button")
    .filter({ hasNot: page.locator(".close") })
    .nth(-2);

async function expectSizeButton(page: Page, label: string, icon: "maximize" | "restore") {
  const b = sizeButton(page);
  await expect(b).toHaveAccessibleName(label);
  await expect(b).toHaveAttribute("data-tip", label);
  await expect(b.locator("svg")).toHaveAttribute("data-icon", icon);
}

async function fullScreenChecked(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "View", exact: true }).hover();
  const checked = await page.getByRole("menuitemcheckbox", { name: /^Full Screen/ }).getAttribute("aria-checked");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  return checked === "true";
}

test.describe("BUG-1: the maximize button and Full Screen follow the window", () => {
  test.skip(process.platform === "darwin", "macOS keeps its native traffic lights");

  test("in full screen the button shows restore and says Exit Full Screen; one click returns to the window's size", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      const before = await settled(app);
      expect(before.fullScreen).toBe(false);
      await expectSizeButton(page, "Maximize", "maximize");

      await page.keyboard.press("F11");
      await expect.poll(async () => (await win(app)).fullScreen).toBe(true);
      await expectSizeButton(page, "Exit Full Screen", "restore");

      await sizeButton(page).click();
      await expect.poll(async () => (await win(app)).fullScreen).toBe(false);
      await expect.poll(async () => (await win(app)).bounds).toEqual(before.bounds);
      expect((await win(app)).maximized).toBe(false);
      await expectSizeButton(page, "Maximize", "maximize");
      // It stays out of full screen: no snapping back.
      await page.waitForTimeout(500);
      expect((await win(app)).fullScreen).toBe(false);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("from a maximized window, one click in full screen returns to maximized", async () => {
    // Without a window manager (xvfb) a window can't be maximized at all; the next tests prove the button stays true.
    test.skip(!windowManagerCanMaximize(), "no window manager to maximize the window");
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      await sizeButton(page).click();
      await expect.poll(async () => (await win(app)).maximized).toBe(true);
      await expectSizeButton(page, RESTORE, "restore");

      await page.keyboard.press("F11");
      await expect.poll(async () => (await win(app)).fullScreen).toBe(true);
      await expectSizeButton(page, "Exit Full Screen", "restore");

      await sizeButton(page).click();
      await expect.poll(async () => (await win(app)).fullScreen).toBe(false);
      await expect.poll(async () => (await win(app)).maximized).toBe(true);
      await expectSizeButton(page, RESTORE, "restore");
      await page.waitForTimeout(500);
      expect(await win(app)).toMatchObject({ fullScreen: false, maximized: true });
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("View > Full Screen is checked in full screen; F11, the menu, the button and the OS stay in sync", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      expect(await fullScreenChecked(page)).toBe(false);
      await page.keyboard.press("F11");
      await expect.poll(async () => (await win(app)).fullScreen).toBe(true);
      expect(await fullScreenChecked(page)).toBe(true);

      // The OS leaves full screen (e.g. Esc in a full-screen prompt): the button and the menu follow.
      await fromOs(app, "leaveFullScreen");
      await expect.poll(async () => (await win(app)).fullScreen).toBe(false);
      await expectSizeButton(page, "Maximize", "maximize");
      expect(await fullScreenChecked(page)).toBe(false);

      await fromOs(app, "enterFullScreen");
      await expectSizeButton(page, "Exit Full Screen", "restore");
      expect(await fullScreenChecked(page)).toBe(true);
      await page.keyboard.press("F11");
      await expect.poll(async () => (await win(app)).fullScreen).toBe(false);
      await expectSizeButton(page, "Maximize", "maximize");
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("maximize and restore from the OS (title-bar double-click, Win+Up, snap) update the button", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      if (!windowManagerCanMaximize()) {
        // No window manager (xvfb): maximize requests go nowhere, and the button must not claim otherwise.
        await fromOs(app, "maximize");
        await sizeButton(page).click();
        await page.waitForTimeout(500);
        expect((await win(app)).maximized).toBe(false);
        await expectSizeButton(page, "Maximize", "maximize");
        return;
      }
      await fromOs(app, "maximize");
      await expect.poll(async () => (await win(app)).maximized).toBe(true);
      await expectSizeButton(page, RESTORE, "restore");
      await fromOs(app, "unmaximize");
      await expect.poll(async () => (await win(app)).maximized).toBe(false);
      await expectSizeButton(page, "Maximize", "maximize");
      // And the button then does the right thing.
      await sizeButton(page).click();
      await expect.poll(async () => (await win(app)).maximized).toBe(true);
      await sizeButton(page).click();
      await expect.poll(async () => (await win(app)).maximized).toBe(false);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });
});
