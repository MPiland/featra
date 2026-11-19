import { join } from "node:path";
import { BrowserWindow, nativeTheme } from "electron";
import { IPC, type WindowState } from "@featra/client/bridge";
import { appIconPath } from "./app-icon.ts";
import { e2e } from "./test-hooks.ts";

/** `FEATRA_CLIENT_URL` loads the Vite dev server instead of the built client. */
const clientUrl = process.env.FEATRA_CLIENT_URL;

/** Matches the client's --bg tokens so the window never flashes the wrong colour before the page paints. */
export const windowBackground = () => (nativeTheme.shouldUseDarkColors ? "#1c1c1e" : "#fbfbfa");

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
