import { dialog, type BrowserWindow, type OpenDialogOptions } from "electron";
import { e2e, testHooks } from "./test-hooks.ts";

export interface FolderDialog {
  /** The dialog's title bar ("Open Folder"). */
  title: string;
  /** The confirm button ("Open", "Choose"). */
  button: string;
  /** The folder it starts in. */
  from?: string;
}

/**
 * The OS folder picker, modal to the window. Resolves to the chosen folder, or null when the user cancels. E2E runs
 * take the next folder the test queued instead (Playwright can't drive a native dialog) and record what was asked.
 */
export async function pickFolder(win: BrowserWindow | null, ask: FolderDialog): Promise<string | null> {
  if (e2e) {
    testHooks.folderDialogs.push(ask.title);
    return testHooks.folderPicks.shift() ?? null;
  }
  const options: OpenDialogOptions = {
    title: ask.title,
    buttonLabel: ask.button,
    properties: ["openDirectory", "createDirectory"],
    ...(ask.from ? { defaultPath: ask.from } : {}),
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}
