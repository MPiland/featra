import { join } from "node:path";
import { app, BrowserWindow, ipcMain, nativeTheme, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { IPC, normalizeUiState } from "@featra/client/bridge";
import { createUiStateStore, type UiStateStore } from "./ui-state-store.ts";

// Tests (and anyone running a second profile) point userData at their own folder. Must happen before `ready`.
const userDataDir = process.env.FEATRA_USER_DATA_DIR;
if (userDataDir) app.setPath("userData", userDataDir);

/** `FEATRA_CLIENT_URL` loads the Vite dev server; otherwise the built client next to this app in the workspace. */
const clientUrl = process.env.FEATRA_CLIENT_URL;
const clientIndex = join(__dirname, "../../../packages/client/dist/index.html");

/** Matches the client's --bg tokens so the window never flashes the wrong colour before the page paints. */
const windowBackground = () => (nativeTheme.shouldUseDarkColors ? "#1c1c1e" : "#fbfbfa");

function createWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    title: "Featra",
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
  if (clientUrl) void win.loadURL(clientUrl);
  else void win.loadFile(clientIndex);
  return win;
}

function registerIpc(store: UiStateStore) {
  const fromOurWindow = (e: IpcMainEvent | IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);

  ipcMain.handle(IPC.uiStateLoad, () => store.load());
  ipcMain.handle(IPC.uiStateSave, (_e, state: unknown) => store.save(normalizeUiState(state)));
  ipcMain.on(IPC.windowMinimize, (e) => fromOurWindow(e)?.minimize());
  ipcMain.on(IPC.windowToggleMaximize, (e) => {
    const win = fromOurWindow(e);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on(IPC.windowClose, (e) => fromOurWindow(e)?.close());
  ipcMain.on(IPC.appReload, (e) => e.sender.reload());
  ipcMain.on(IPC.appToggleDevTools, (e) => e.sender.toggleDevTools());
  ipcMain.on(IPC.appQuit, () => app.quit());
}

// The window only ever shows the bundled client: no navigation away, no pop-up windows.
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (e) => e.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const store = createUiStateStore(app.getPath("userData"));
  registerIpc(store);

  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });

  nativeTheme.on("updated", () => {
    for (const win of BrowserWindow.getAllWindows()) win.setBackgroundColor(windowBackground());
  });

  // Don't lose the last sidebar toggle to a fast quit: let pending writes land first.
  app.on("will-quit", (e) => {
    if (!store.pending) return;
    e.preventDefault();
    void store.flush().finally(() => app.quit());
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  void app.whenReady().then(createWindow);
}
