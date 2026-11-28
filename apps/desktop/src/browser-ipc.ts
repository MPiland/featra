import { BrowserWindow, ipcMain, type IpcMainEvent } from "electron";
import { IPC, normalizeBrowserLayout } from "@featra/client/bridge";
import { isRecord } from "@featra/work-format/guards";
import { closePane, openPane, paneOf, type BrowserTarget } from "./browser-pane.ts";

/**
 * The page's calls for its Browser pane (STORY-74, ADR 0047). Each names the pane by its key, so only the window's open
 * pane is driven; every payload is checked, as the page is not trusted, and the URL again where it is loaded.
 */
const win = (e: IpcMainEvent) => BrowserWindow.fromWebContents(e.sender);
const pane = (e: IpcMainEvent, key: unknown) => paneOf(win(e), key);

/** What the pane shows, read from the page: its project and story or feature; null when malformed. */
export function targetOf(raw: unknown): BrowserTarget | null {
  if (!isRecord(raw)) return null;
  const { dir, id } = raw;
  return typeof dir === "string" && dir && dir.length <= 1000 && typeof id === "string" && id && id.length <= 100
    ? { dir, id }
    : null;
}

/** An annotation's id from the page; null when malformed. */
const annotationId = (v: unknown) => (typeof v === "string" && v.length <= 100 ? v : null);

export function registerBrowserIpc(log: (message: string) => void): void {
  ipcMain.on(IPC.browserOpen, (e, key: unknown, target: unknown) => {
    const w = win(e);
    const shows = targetOf(target);
    if (w && typeof key === "string" && key && shows) openPane(w, key.slice(0, 100), shows, log);
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
  ipcMain.on(IPC.browserFocus, (e, key: unknown) => pane(e, key)?.focus());
  ipcMain.on(IPC.browserClose, (e, key: unknown) => closePane(win(e), key));
  // Annotate (STORY-75): the pane's annotations are main's; the page asks for changes by id.
  ipcMain.on(
    IPC.browserAnnotate,
    (e, key: unknown, on: unknown) => void pane(e, key)?.annotations.annotate(on === true),
  );
  ipcMain.on(IPC.browserAnnotationEdit, (e, key: unknown, which: unknown) =>
    pane(e, key)?.annotations.edit(annotationId(which)),
  );
  ipcMain.on(IPC.browserAnnotationComment, (e, key: unknown, which: unknown, text: unknown) => {
    const a = annotationId(which);
    if (a && typeof text === "string") pane(e, key)?.annotations.comment(a, text);
  });
  ipcMain.on(IPC.browserAnnotationRemove, (e, key: unknown, which: unknown) => {
    const a = annotationId(which);
    if (a) pane(e, key)?.annotations.remove(a);
  });
}
