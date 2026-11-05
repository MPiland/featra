import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  chooseTrayItem,
  clickTray,
  closeFromOs,
  exited,
  launch,
  launchAgain,
  minimizeCalls,
  notices,
  recordMinimize,
  tempUserData,
  trayExists,
  trayMenuLabels,
  windowFocused,
  windowManagerCanMinimize,
  windowVisible,
} from "./app.ts";

/**
 * AC6 in the real app. The tray icon is Electron's real Tray; only the OS side of it is driven from the test
 * (Playwright can't click the notification area), and the OS notification is recorded instead of shown.
 */

const NOTICE = "Featra is still running in the system tray";

async function chooseFromMenu(page: Page, ...path: string[]) {
  await page.getByRole("button", { name: "Menu" }).click();
  const last = path.pop()!;
  for (const name of path) await page.getByRole("menuitem", { name, exact: true }).hover();
  await page.getByRole("menuitem").filter({ hasText: new RegExp(`^${last}`) }).click();
}

test.describe("AC6: close to tray", () => {
  test("close hides the window and the app keeps running; the notice shows once and is remembered", async () => {
    const profile = await tempUserData();
    try {
      let { app, page } = await launch(profile.dir);
      expect(await trayExists(app)).toBe(true);
      expect(await trayMenuLabels(app)).toEqual(["Show Featra", "Exit"]);

      await page.getByRole("button", { name: "Close window" }).click();
      await expect.poll(() => windowVisible(app)).toBe(false);
      expect(app.process().exitCode).toBeNull();
      expect(await notices(app)).toEqual([NOTICE]);

      // The page is still alive behind the hidden window: its state is untouched.
      await clickTray(app);
      await expect.poll(() => windowVisible(app)).toBe(true);
      await closeFromOs(app); // the path Alt+F4 takes
      await expect.poll(() => windowVisible(app)).toBe(false);
      expect(await notices(app)).toEqual([NOTICE]); // only on the first close

      await chooseTrayItem(app, "Exit");
      await exited(app);

      ({ app, page } = await launch(profile.dir));
      await page.getByRole("button", { name: "Close window" }).click();
      await expect.poll(() => windowVisible(app)).toBe(false);
      expect(await notices(app)).toEqual([]); // remembered from the last run
      await chooseTrayItem(app, "Exit");
      await exited(app);
    } finally {
      await profile.dispose();
    }
  });

  test("the tray's Show Featra and a tray click restore and focus the window", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Inbox" }).click();
      await page.getByRole("button", { name: "Close window" }).click();
      await expect.poll(() => windowVisible(app)).toBe(false);

      await chooseTrayItem(app, "Show Featra");
      await expect.poll(() => windowVisible(app)).toBe(true);
      await expect.poll(() => windowFocused(app)).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inbox"); // same window, not a new one

      const minimized = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized());
      await recordMinimize(app);
      await page.getByRole("button", { name: "Minimize" }).click();
      await expect.poll(() => minimizeCalls(app)).toBe(1);
      // Where the window manager can't minimise (WSLg, xvfb: see windowManagerCanMinimize), the request is all
      // Featra can do, and the window stays where the user sees it; elsewhere it must really minimise.
      if (windowManagerCanMinimize()) await expect.poll(minimized).toBe(true);
      else expect(await minimized()).toBe(false);
      // Linux trays often ignore clicks, so there the restore path is the right-click menu's Show Featra.
      if (process.platform === "linux") await chooseTrayItem(app, "Show Featra");
      else await clickTray(app);
      await expect.poll(() => windowVisible(app)).toBe(true);
      await expect.poll(minimized).toBe(false);
      await expect.poll(() => windowFocused(app)).toBe(true);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("File > Exit exits for real, even when close goes to the tray", async () => {
    const profile = await tempUserData();
    try {
      const { app, page } = await launch(profile.dir);
      const exit = exited(app);
      // The app exits mid-click, so Playwright's click can only report that the page went away.
      await chooseFromMenu(page, "File", "Exit").catch((e: Error) => {
        if (!/has been closed/.test(e.message)) throw e;
      });
      expect(await exit).toBe(0);
    } finally {
      await profile.dispose();
    }
  });

  test("File > Close Window and Ctrl+Shift+W hide the window to the tray, like the close button", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      await chooseFromMenu(page, "File", "Close Window");
      await expect.poll(() => windowVisible(app)).toBe(false);
      expect(app.process().exitCode).toBeNull();
      expect(await notices(app)).toEqual([NOTICE]);
      await clickTray(app);
      await expect.poll(() => windowVisible(app)).toBe(true);
      await page.keyboard.press("Control+Shift+W");
      await expect.poll(() => windowVisible(app)).toBe(false);
      expect(app.process().exitCode).toBeNull();
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("Ctrl+Q does not quit on Windows: Exit has no shortcut", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      await page.keyboard.press("Control+Q");
      // Give a quit time to happen: the page and the window must still be there afterwards.
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      expect(app.process().exitCode).toBeNull();
      expect(await windowVisible(app)).toBe(true);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("the tray's Exit exits while the window is hidden", async () => {
    const profile = await tempUserData();
    try {
      const { app, page } = await launch(profile.dir);
      await page.getByRole("button", { name: "Close window" }).click();
      await expect.poll(() => windowVisible(app)).toBe(false);
      await chooseTrayItem(app, "Exit");
      expect(await exited(app)).toBe(0);
    } finally {
      await profile.dispose();
    }
  });

  test("with no tray on the desktop (stock GNOME), close quits instead of hiding the window", async () => {
    const profile = await tempUserData();
    try {
      // Fakes the platform: the desktop has no StatusNotifier host (detection itself is unit-tested).
      const { app, page } = await launch(profile.dir, { FEATRA_E2E_TRAY: "absent" });
      expect(await trayExists(app)).toBe(false);
      const exit = exited(app);
      await page.getByRole("button", { name: "Close window" }).click().catch((e: Error) => {
        if (!/has been closed/.test(e.message)) throw e;
      });
      expect(await exit).toBe(0); // quit, with no tray notice first
      expect(await readFile(join(profile.dir, "logs", "main.log"), "utf8")).toMatch(/No tray: close quits\n[^]*Quitting\n/);
    } finally {
      await profile.dispose();
    }
  });

  test("launching Featra again shows the running app's window instead of starting a second app", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Inbox" }).click();
      await page.getByRole("button", { name: "Close window" }).click();
      await expect.poll(() => windowVisible(app)).toBe(false);

      await launchAgain(profile.dir); // the second process hands over to the first and exits
      await expect.poll(() => windowVisible(app)).toBe(true);
      await expect.poll(() => windowFocused(app)).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inbox");
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });
});
