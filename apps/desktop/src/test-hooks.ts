import type { Menu, Tray } from "electron";

/**
 * E2E runs set FEATRA_E2E=1. What differs is only where Featra meets the OS: notifications and "show in File Explorer"
 * are recorded, folder dialogs answer with folders the test queued, a restart only quits (a relaunched app would escape the test), and the tray is reachable
 * from the test (Playwright can't click the real notification area).
 */
export const e2e = process.env.FEATRA_E2E === "1";

export interface TestHooks {
  notices: string[];
  shownInFolder: string[];
  /** Folders the next folder dialogs return, in order; an empty queue is a cancelled dialog. */
  folderPicks: string[];
  /** Titles of the folder dialogs Featra opened. */
  folderDialogs: string[];
  tray?: Tray;
  trayMenu?: Menu;
}

export const testHooks: TestHooks = { notices: [], shownInFolder: [], folderPicks: [], folderDialogs: [] };

declare global {
  /** Set only in E2E runs, for the test to read through Playwright's main-process evaluate. */
  var featraTest: TestHooks | undefined;
}
if (e2e) globalThis.featraTest = testHooks;
