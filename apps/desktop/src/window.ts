import { join } from "node:path";
import { BrowserWindow, nativeTheme, session } from "electron";
import { IPC, type WindowState } from "@featra/client/bridge";
import { appIconPath } from "./app-icon.ts";
import { e2e } from "./test-hooks.ts";

/** `FEATRA_CLIENT_URL` loads the Vite dev server instead of the built client. */
const clientUrl = process.env.FEATRA_CLIENT_URL;

/** Matches the client's --bg tokens so the window never flashes the wrong colour before the page paints. */
export const windowBackground = () => (nativeTheme.shouldUseDarkColors ? "#1c1c1e" : "#fbfbfa");

/**
 * The window's session: in memory (no `persist:`), so the page's first request never waits on reading the profile's
 * cookies from disk; the page keeps its state through the main process, not in web storage (BUG-40, ADR 0046).
 */
export const WINDOW_PARTITION = "featra";

/**
 * Before the window opens: its session connects directly, so the page never waits on the system's proxy settings.
 * The default session, which loads nothing, connects directly too, or Chromium fetches a proxy script for it at
 * startup (BUG-40, ADR 0046).
 */
export async function prepareWindowSession(): Promise<void> {
  await Promise.all(
    [session.fromPartition(WINDOW_PARTITION), session.defaultSession].map((s) => s.setProxy({ mode: "direct" })),
  );
}

/** The window, showing the built client at `client` (`clientIndex`: the workspace's, or the installed app's). */
export function createWindow(client: string): BrowserWindow {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    title: "Featra",
    icon: appIconPath(process.platform),
    show: false,
    backgroundColor: windowBackground(),
    // The title bar is drawn by the client. macOS keeps its traffic lights; elsewhere the client draws the controls.
    ...(isMac ? { titleBarStyle: "hiddenInset" as const } : { frame: false }),
    // The e2e layout journeys size the window to 1280×800, taller than a CI Mac's screen, which macOS otherwise
    // shrinks the window to fit. Windows and Linux allow it already; the app itself keeps macOS's limit.
    enableLargerThanScreen: e2e,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: WINDOW_PARTITION,
    },
  });
  win.once("ready-to-show", () => win.show());
  // Tell the page about every maximize and full-screen change, including the OS's own (title-bar double-click,
  // Win+Up, snapping, leaving full screen), so the title bar and View > Full Screen never go stale (BUG-1).
  const sendState = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.windowStateChanged, windowState(win));
  };
  win.on("maximize", sendState);
  win.on("unmaximize", sendState);
  win.on("enter-full-screen", sendState);
  win.on("leave-full-screen", sendState);
  if (clientUrl) void win.loadURL(clientUrl);
  else void win.loadFile(client);
  return win;
}

export const windowState = (win: BrowserWindow): WindowState => ({
  maximized: win.isMaximized(),
  fullScreen: win.isFullScreen(),
});
