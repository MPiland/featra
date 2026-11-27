import { BrowserWindow, ipcMain, type IpcMainEvent } from "electron";
import { IPC, normalizeBrowserLayout } from "@featra/client/bridge";
import { closePane, openPane, paneOf } from "./browser-pane.ts";

/**
 * The page's calls for its Browser pane (STORY-74, ADR 0047). Each names the pane by its key, so only the window's open
 * pane is driven; every payload is checked, as the page is not trusted, and the URL again where it is loaded.
 */
const win = (e: IpcMainEvent) => BrowserWindow.fromWebContents(e.sender);
const pane = (e: IpcMainEvent, key: unknown) => paneOf(win(e), key);

export function registerBrowserIpc(log: (message: string) => void): void {
  ipcMain.on(IPC.browserOpen, (e, key: unknown) => {
    const w = win(e);
    if (w && typeof key === "string" && key) openPane(w, key.slice(0, 100), log);
  });
  ipcMain.on(IPC.browserLayout, (e, key: unknown, layout: unknown) =>
    pane(e, key)?.layout(normalizeBrowserLayout(layout)),
  );
  ipcMain.on(IPC.browserNavigate, (e, key: unknown, url: unknown) => {
    if (typeof url === "string") pane(e, key)?.navigate(url);
  });
  ipcMain.on(IPC.browserBack, (e, key: unknown) => pane(e, key)?.back());
  ipcMain.on(IPC.browserForward, (e, key: unknown) => pane(e, key)?.forward());
  ipcMain.on(IPC.browserReload, (e, key: unknown) => pane(e, key)?.reload());
  ipcMain.on(IPC.browserClose, (e, key: unknown) => closePane(win(e), key));
}
