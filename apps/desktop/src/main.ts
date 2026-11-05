import { execFile } from "node:child_process";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  session,
  shell,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { EDIT_COMMANDS, IPC, normalizeUiState, THEME_CHOICES, type EditCommand, type ThemeChoice } from "@featra/client/bridge";
import { normalizeZoom } from "@featra/client/zoom";
import { createLifecycle, type Lifecycle } from "./lifecycle.ts";
import { createLog, type Log } from "./log.ts";
import { hasTrayHost, type RunCommand } from "./tray-support.ts";
import { clearCacheAndRestart, resetAppData, type TroubleshootDeps } from "./troubleshoot.ts";
import { createAppStateStore, createUiStateStore, type UiStateStore } from "./ui-state-store.ts";

/**
 * Close sends Featra to the system tray (the Dock on macOS) instead of quitting, so agent sessions keep running.
 * STORY-20 wires this to Settings; until then it is always on.
 */
const CLOSE_TO_TRAY = true;

/**
 * E2E runs set FEATRA_E2E=1. What differs is only where Featra meets the OS: notifications and "show in File Explorer"
 * are recorded, a restart only quits (a relaunched app would escape the test), and the tray is reachable
 * from the test (Playwright can't click the real notification area).
 */
const e2e = process.env.FEATRA_E2E === "1";
interface TestHooks {
  notices: string[];
  shownInFolder: string[];
  tray?: Tray;
  trayMenu?: Menu;
}
/**
 * Whether the desktop has a tray. E2E runs fake the answer (`FEATRA_E2E_TRAY=present|absent`, default present) so the
 * tray tests run on any desktop and the no-tray path can be proved too; otherwise the session bus is asked.
 */
const runCommand: RunCommand = (command, args) =>
  new Promise((resolve, reject) =>
    execFile(command, [...args], { timeout: 2000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );
const trayAvailable = (): Promise<boolean> =>
  e2e
    ? Promise.resolve(process.env.FEATRA_E2E_TRAY !== "absent" && process.platform !== "darwin")
    : hasTrayHost(process.platform, runCommand);
const testHooks: TestHooks = { notices: [], shownInFolder: [] };
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

interface MainDeps {
  store: UiStateStore;
  lifecycle: Lifecycle;
  log: Log;
  troubleshoot: TroubleshootDeps;
}

function registerIpc({ store, lifecycle, log, troubleshoot }: MainDeps) {
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
  ipcMain.on(IPC.windowToggleFullScreen, (e) => {
    const win = fromOurWindow(e);
    win?.setFullScreen(!win.isFullScreen());
  });
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
  ipcMain.on(IPC.appShowLogs, () => {
    // Flush first, so the file exists and holds everything logged so far.
    void log.flush().then(() => (e2e ? void testHooks.shownInFolder.push(log.file) : shell.showItemInFolder(log.file)));
  });
  ipcMain.on(IPC.appClearCacheAndRestart, () => void clearCacheAndRestart(troubleshoot));
  ipcMain.on(IPC.appResetAppData, () => void resetAppData(troubleshoot));
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
  const log = createLog(join(app.getPath("userData"), "logs"));
  log.info(`Featra ${app.getVersion()} started (${process.platform})`);
  let win: BrowserWindow | undefined;
  let tray: Tray | undefined;

  void app.whenReady().then(async () => {
    if (process.platform === "win32") app.setAppUserModelId("dev.featra.app"); // notifications need it on Windows
    setNativeMenu();
    const [ui, remembered, hasTray] = await Promise.all([store.load(), appState.load(), trayAvailable()]);
    if (process.platform !== "darwin") log.info(hasTray ? "Tray available" : "No tray: close quits");
    const lifecycle = createLifecycle({
      platform: process.platform,
      closeToTray: CLOSE_TO_TRAY,
      trayAvailable: hasTray,
      noticeShown: remembered.trayNoticeShown,
      notify: showNotice,
      rememberNotice: () => void appState.save({ trayNoticeShown: true }),
      exit: () => app.quit(),
    });
    registerIpc({
      store,
      lifecycle,
      log,
      troubleshoot: {
        session: session.defaultSession,
        stores: [store, appState],
        log,
        restart: () => {
          if (!e2e) app.relaunch(); // the test launches the next instance itself, and checks the log for the restart
          lifecycle.quit();
        },
      },
    });
    let loggedQuit = false;
    app.on("before-quit", () => {
      lifecycle.onBeforeQuit();
      if (!loggedQuit) log.info("Quitting");
      loggedQuit = true;
    });

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
    win.on("hide", () => log.info("Window hidden"));
    win.on("show", () => log.info("Window shown"));
    lifecycle.manage(win);
    if (lifecycle.usesTray) tray = createTray(win, lifecycle);
  });

  nativeTheme.on("updated", () => {
    for (const w of BrowserWindow.getAllWindows()) w.setBackgroundColor(windowBackground());
  });

  // Don't lose the last sidebar toggle (or the notice flag) to a fast quit: let pending writes land first. By
  // will-quit the windows are closed and every quit handler has run, so finish with app.exit() rather than a second
  // app.quit(): on Linux a re-entered quit after DevTools have been opened is sometimes dropped and the app hangs.
  let exiting = false;
  app.on("will-quit", (e) => {
    e.preventDefault();
    if (exiting) return;
    exiting = true;
    void Promise.all([store.flush(), appState.flush(), log.flush()]).finally(() => app.exit(0));
  });

  // Only reached when close-to-tray is off or the app is quitting.
  app.on("window-all-closed", () => {
    tray?.destroy();
    if (process.platform !== "darwin") app.quit();
  });
}
