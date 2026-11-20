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
  /** Links Featra asked the OS browser to open (a story's PR). */
  openedExternal: string[];
  /** Folders the next folder dialogs return, in order; an empty queue is a cancelled dialog. */
  folderPicks: string[];
  /** Titles of the folder dialogs Featra opened. */
  folderDialogs: string[];
  /** The desktop notifications Featra showed (STORY-7), each with the click a user would make. */
  notifications: ShownNotification[];
  /** Whether Featra counts as focused, for the test to set; null leaves it to the window. */
  focused: boolean | null;
  /** The taskbar and Dock badge as Featra last set it (STORY-67), by the OS call that set it. */
  badge: BadgeRecord;
  tray?: Tray;
  trayMenu?: Menu;
}

/**
 * The badge calls Featra made: the Dock text, the launcher count, and the taskbar overlay as Electron took it (its size
 * in screen points, and whether the image is empty) with its description; null once cleared.
 */
export interface BadgeRecord {
  dock?: string;
  launcher?: number;
  overlay?: { label: string; description: string; width: number; height: number; empty: boolean } | null;
}

/** A notification as the test sees it: what it said, and a way to click it. */
export interface ShownNotification {
  title: string;
  body: string;
  click: () => void;
}

export const testHooks: TestHooks = {
  notices: [],
  shownInFolder: [],
  openedExternal: [],
  folderPicks: [],
  folderDialogs: [],
  notifications: [],
  focused: null,
  badge: {},
};

declare global {
  /** Set only in E2E runs, for the test to read through Playwright's main-process evaluate. */
  var featraTest: TestHooks | undefined;
}
if (e2e) globalThis.featraTest = testHooks;
