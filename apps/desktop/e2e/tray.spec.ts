import { expect, test, type Page } from "@playwright/test";
import {
  chooseTrayItem,
  clickTray,
  closeFromOs,
  exited,
  launch,
  launchAgain,
  notices,
  tempUserData,
  trayExists,
  trayMenuLabels,
  windowFocused,
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
      expect(await trayMenuLabels(app)).toEqual(["Show Featra", "Quit Featra"]);

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

      await chooseTrayItem(app, "Quit Featra");
      await exited(app);

      ({ app, page } = await launch(profile.dir));
      await page.getByRole("button", { name: "Close window" }).click();
      await expect.poll(() => windowVisible(app)).toBe(false);
      expect(await notices(app)).toEqual([]); // remembered from the last run
      await chooseTrayItem(app, "Quit Featra");
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

      await page.getByRole("button", { name: "Minimize" }).click();
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(true);
      await clickTray(app);
      await expect.poll(() => windowVisible(app)).toBe(true);
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(false);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("File > Quit exits for real, even when close goes to the tray", async () => {
    const profile = await tempUserData();
    try {
      const { app, page } = await launch(profile.dir);
      const exit = exited(app);
      // The app exits mid-click, so Playwright's click can only report that the page went away.
      await chooseFromMenu(page, "File", "Quit").catch((e: Error) => {
        if (!/has been closed/.test(e.message)) throw e;
      });
      expect(await exit).toBe(0);
    } finally {
      await profile.dispose();
    }
  });

  test("Ctrl+Q quits for real (File > Quit's shortcut; Alt+F4 is close)", async () => {
    const profile = await tempUserData();
    try {
      const { app, page } = await launch(profile.dir);
      const exit = exited(app);
      await page.keyboard.press("Control+Q").catch((e: Error) => {
        if (!/has been closed/.test(e.message)) throw e;
      });
      expect(await exit).toBe(0);
    } finally {
      await profile.dispose();
    }
  });

  test("the tray's Quit Featra exits while the window is hidden", async () => {
    const profile = await tempUserData();
    try {
      const { app, page } = await launch(profile.dir);
      await page.getByRole("button", { name: "Close window" }).click();
      await expect.poll(() => windowVisible(app)).toBe(false);
      await chooseTrayItem(app, "Quit Featra");
      expect(await exited(app)).toBe(0);
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
