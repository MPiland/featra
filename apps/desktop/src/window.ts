import { join } from "node:path";
import { BrowserWindow, nativeTheme } from "electron";
import { IPC, type WindowState } from "@featra/client/bridge";
import { appIconPath } from "./app-icon.ts";

/** `FEATRA_CLIENT_URL` loads the Vite dev server; otherwise the built client next to this app in the workspace. */
const clientUrl = process.env.FEATRA_CLIENT_URL;
const clientIndex = join(__dirname, "../../../packages/client/dist/index.html");

/** Matches the client's --bg tokens so the window never flashes the wrong colour before the page paints. */
export const windowBackground = () => (nativeTheme.shouldUseDarkColors ? "#1c1c1e" : "#fbfbfa");

export function createWindow(): BrowserWindow {
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
  else void win.loadFile(clientIndex);
  return win;
}

export const windowState = (win: BrowserWindow): WindowState => ({
  maximized: win.isMaximized(),
  fullScreen: win.isFullScreen(),
});
