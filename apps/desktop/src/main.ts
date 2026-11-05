import { join } from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { EDIT_COMMANDS, IPC, normalizeUiState, THEME_CHOICES, type EditCommand, type ThemeChoice } from "@featra/client/bridge";
import { normalizeZoom } from "@featra/client/zoom";
import { createLifecycle, type Lifecycle } from "./lifecycle.ts";
import { createAppStateStore, createUiStateStore, type UiStateStore } from "./ui-state-store.ts";

/**
 * Close sends Featra to the system tray (the Dock on macOS) instead of quitting, so agent sessions keep running.
 * STORY-20 wires this to Settings; until then it is always on.
 */
const CLOSE_TO_TRAY = true;

/**
 * E2E runs set FEATRA_E2E=1. The only difference: OS notifications are recorded instead of shown, and the tray is
 * reachable from the test (Playwright can't click the real notification area).
 */
const e2e = process.env.FEATRA_E2E === "1";
interface TestHooks {
  notices: string[];
  tray?: Tray;
  trayMenu?: Menu;
}
const testHooks: TestHooks = { notices: [] };
if (e2e) (globalThis as { featraTest?: TestHooks }).featraTest = testHooks;

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

function registerIpc(store: UiStateStore, lifecycle: Lifecycle) {
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
  ipcMain.on(IPC.windowSetZoom, (e, factor: unknown) => e.sender.setZoomFactor(normalizeZoom(factor)));
  ipcMain.on(IPC.windowSetTheme, (_e, theme: unknown) => {
    if (THEME_CHOICES.includes(theme as ThemeChoice)) nativeTheme.themeSource = theme as ThemeChoice;
  });
  // The same webContents calls Electron's undo/redo/cut/copy/paste/selectAll menu roles make: they act on the
  // focused field.
  ipcMain.on(IPC.edit, (e, command: unknown) => {
    if (EDIT_COMMANDS.includes(command as EditCommand)) e.sender[command as EditCommand]();
  });
  ipcMain.handle(IPC.appInfo, () => ({ name: "Featra", version: app.getVersion() }));
  ipcMain.on(IPC.appReload, (e) => e.sender.reload());
  ipcMain.on(IPC.appToggleDevTools, (e) => e.sender.toggleDevTools());
  ipcMain.on(IPC.appQuit, () => lifecycle.quit());
}

/**
 * The menu lives in the client's title bar. Windows and Linux get no native menu (its default accelerators would
 * fight the client's zoom and reload). macOS needs one for the menu bar, Cmd+Q and the system edit shortcuts.
 */
function setNativeMenu() {
  if (process.platform !== "darwin") return Menu.setApplicationMenu(null);
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }]));
}

function showNotice(message: string) {
  if (e2e) return void testHooks.notices.push(message);
  if (Notification.isSupported()) new Notification({ title: "Featra", body: message }).show();
}

/** Placeholder icon until there is a logo (see decisions.md). Electron picks tray@2x.png on high-DPI screens. */
function createTray(win: BrowserWindow, lifecycle: Lifecycle): Tray {
  const tray = new Tray(join(__dirname, "../assets/tray.png"));
  tray.setToolTip("Featra");
  tray.on("click", () => lifecycle.reveal(win));
  const menu = Menu.buildFromTemplate(lifecycle.trayMenu(win).map(({ label, click }) => ({ label, click })));
  tray.setContextMenu(menu);
  testHooks.tray = tray;
  testHooks.trayMenu = menu;
  return tray;
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
  const appState = createAppStateStore(app.getPath("userData"));
  let win: BrowserWindow | undefined;
  let tray: Tray | undefined;

  void app.whenReady().then(async () => {
    if (process.platform === "win32") app.setAppUserModelId("dev.featra.app"); // notifications need it on Windows
    setNativeMenu();
    const [ui, remembered] = await Promise.all([store.load(), appState.load()]);
    const lifecycle = createLifecycle({
      platform: process.platform,
      closeToTray: CLOSE_TO_TRAY,
      noticeShown: remembered.trayNoticeShown,
      notify: showNotice,
      rememberNotice: () => void appState.save({ trayNoticeShown: true }),
      exit: () => app.quit(),
    });
    registerIpc(store, lifecycle);
    app.on("before-quit", () => lifecycle.onBeforeQuit());

    // A second launch (Start menu, shortcut) brings back the running app's window instead of starting another app.
    app.on("second-instance", () => {
      if (win && !win.isDestroyed()) lifecycle.reveal(win);
    });
    // macOS: clicking the Dock icon brings the hidden window back.
    app.on("activate", () => {
      if (win && !win.isDestroyed()) lifecycle.reveal(win);
      else lifecycle.manage((win = createWindow()));
    });

    // Apply a pinned theme before the window exists so its background matches from the first frame.
    nativeTheme.themeSource = ui.theme;
    win = createWindow();
    lifecycle.manage(win);
    if (lifecycle.usesTray) tray = createTray(win, lifecycle);
  });

  nativeTheme.on("updated", () => {
    for (const w of BrowserWindow.getAllWindows()) w.setBackgroundColor(windowBackground());
  });

  // Don't lose the last sidebar toggle (or the notice flag) to a fast quit: let pending writes land first.
  app.on("will-quit", (e) => {
    if (!store.pending && !appState.pending) return;
    e.preventDefault();
    void Promise.all([store.flush(), appState.flush()]).finally(() => app.quit());
  });

  // Only reached when close-to-tray is off or the app is quitting.
  app.on("window-all-closed", () => {
    tray?.destroy();
    if (process.platform !== "darwin") app.quit();
  });
}
