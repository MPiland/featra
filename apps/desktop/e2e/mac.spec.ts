import { expect, test, type ElectronApplication } from "./fixtures.ts";
import {
  clickDock,
  closeFromOs,
  exited,
  launch,
  notices,
  tempUserData,
  trayExists,
  windowFocused,
  windowInForeground,
  windowVisible,
} from "./app.ts";
import { pressShortcut } from "./keys.ts";
import { busyUserInFront } from "./foreground.ts";
import { mac } from "./mac.ts";

/**
 * STORY-63: macOS's own behaviour in the real app. Playwright can't click the menu bar or the Dock, so the native app
 * menu is read and its items clicked from the main process, and a Dock click is the `activate` event Electron emits
 * for it (`clickDock`), handled by Featra's own handler.
 */

/** The native app menu's top-level menus: each one's role, and its items' roles. */
const appMenu = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) =>
    (Menu.getApplicationMenu()?.items ?? []).map((m) => ({
      role: m.role,
      items: (m.submenu?.items ?? []).flatMap((i) => (i.role ? [i.role] : [])),
    })),
  );
/** The app menu's title and its items' labels, as the menu bar shows them. */
const appMenuLabels = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => {
    const first = Menu.getApplicationMenu()?.items[0];
    return [first?.label ?? "", ...(first?.submenu?.items ?? []).map((i) => i.label)];
  });
const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
const dockVisible = (app: ElectronApplication) => app.evaluate(({ app: electronApp }) => electronApp.dock?.isVisible());

test.describe("macOS: the app menu, the menu bar and the Dock (STORY-63)", () => {
  test.skip(!mac, "macOS's own behaviour; tray.spec.ts covers Windows and Linux");

  test("has the macOS app menu and Edit menu, and no menu bar icon", async () => {
    const profile = await tempUserData();
    const { app } = await launch(profile.dir);
    try {
      const menus = await appMenu(app);
      expect(menus.map((m) => m.role?.toLowerCase())).toEqual(["appmenu", "editmenu"]);
      const [featra, edit] = menus;
      expect(featra?.items.map((r) => r.toLowerCase())).toEqual(
        expect.arrayContaining(["about", "hide", "hideothers", "unhide", "quit"]),
      );
      expect(edit?.items.map((r) => r.toLowerCase())).toEqual(
        expect.arrayContaining(["undo", "redo", "cut", "copy", "paste", "selectall"]),
      );
      // Named Featra, not after the package (regression: "Quit @featra/desktop").
      expect(await appMenuLabels(app)).toEqual(
        expect.arrayContaining(["Featra", "About Featra", "Hide Featra", "Quit Featra"]),
      );
      // The Dock is where a closed Featra lives on macOS: no tray icon in the menu bar.
      expect(await trayExists(app)).toBe(false);
      expect(await dockVisible(app)).toBe(true);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("closing the last window keeps Featra running in the Dock, and the Dock icon shows the same window again", async () => {
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Inbox" }).click();

      // ⌘W, as the File menu shows it.
      await pressShortcut(page, "closeWindow");
      await expect.poll(() => windowVisible(app)).toBe(false);
      expect(app.process().exitCode).toBeNull();
      expect(await dockVisible(app)).toBe(true);
      expect(await notices(app)).toEqual([]); // no "still running" notice: staying in the Dock is the norm
      await busyUserInFront(); // the user is in Finder, so Featra must come to the front, not just stay there
      expect(await windowInForeground(app)).toBe(false);
      await clickDock(app);
      await expect.poll(() => windowVisible(app)).toBe(true);
      await expect.poll(() => windowFocused(app)).toBe(true);
      await expect.poll(() => windowInForeground(app)).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inbox"); // the same window, not a new one
      expect(await windowCount(app)).toBe(1);

      // The red traffic light closes it the same way.
      await closeFromOs(app);
      await expect.poll(() => windowVisible(app)).toBe(false);
      expect(app.process().exitCode).toBeNull();
      await clickDock(app);
      await expect.poll(() => windowVisible(app)).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inbox");
      expect(await windowCount(app)).toBe(1);
    } finally {
      await app.close();
      await profile.dispose();
    }
  });

  test("the app menu's Quit Featra quits, even with the window closed to the Dock", async () => {
    const profile = await tempUserData();
    const { app } = await launch(profile.dir);
    try {
      await closeFromOs(app);
      await expect.poll(() => windowVisible(app)).toBe(false);
      const exit = exited(app);
      await app.evaluate(({ Menu }) => {
        const quit = Menu.getApplicationMenu()
          ?.items.flatMap((m) => m.submenu?.items ?? [])
          .find((i) => i.role?.toLowerCase() === "quit");
        if (!quit) throw new Error("The app menu has no Quit item");
        // macOS runs a role's item natively: the menu bar sends its selector, and `click()` leaves the role to the OS
        // and does nothing. So send Quit's own selector, as the menu bar does, once this evaluate has returned.
        setTimeout(() => Menu.sendActionToFirstResponder("terminate:"), 0);
      });
      expect(await exit).toBe(0);
    } finally {
      await profile.dispose();
    }
  });
});
