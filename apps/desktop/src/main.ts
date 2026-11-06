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
import {
  EDIT_COMMANDS,
  IPC,
  normalizeAppSettings,
  normalizeUiState,
  normalizeWorkOverrides,
  sizeButtonAction,
  THEME_CHOICES,
  WORK_SETTING_KEYS,
  type AppSettings,
  type EditCommand,
  type ProjectRef,
  type ProjectSettings,
  type SettingsSnapshot,
  type ThemeChoice,
  type WindowState,
  type WorkSettingKey,
} from "@featra/client/bridge";
import { normalizeZoom } from "@featra/client/zoom";
import { closeToTraySupport, createLifecycle, type Lifecycle } from "./lifecycle.ts";
import { createLog, type Log } from "./log.ts";
import {
  createSettingsStore,
  findProject,
  readProjectSettings,
  writeProjectValue,
  type SettingsStore,
} from "./settings-store.ts";
import { hasTrayHost, type RunCommand } from "./tray-support.ts";
import { clearCacheAndRestart, resetAppData, type TroubleshootDeps } from "./troubleshoot.ts";
import { createAppStateStore, createUiStateStore, type UiStateStore } from "./ui-state-store.ts";

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

const windowState = (win: BrowserWindow): WindowState => ({
  maximized: win.isMaximized(),
  fullScreen: win.isFullScreen(),
});

interface MainDeps {
  store: UiStateStore;
  lifecycle: Lifecycle;
  log: Log;
  troubleshoot: TroubleshootDeps;
  settings: {
    store: SettingsStore;
    current(): AppSettings;
    /** Stores new app settings and applies them: the close button at once (the page applies the theme). */
    apply(next: AppSettings): Promise<void>;
    project: ProjectRef | null;
  };
}

function registerIpc({ store, lifecycle, log, troubleshoot, settings }: MainDeps) {
  const fromOurWindow = (e: IpcMainEvent | IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);

  ipcMain.handle(IPC.uiStateLoad, () => store.load());
  ipcMain.handle(IPC.uiStateSave, (_e, state: unknown) => store.save(normalizeUiState(state)));
  ipcMain.on(IPC.windowMinimize, (e) => fromOurWindow(e)?.minimize());
  ipcMain.handle(IPC.windowGetState, (e) => {
    const win = fromOurWindow(e);
    return win ? windowState(win) : undefined;
  });
  ipcMain.on(IPC.windowToggleMaximize, (e) => {
    const win = fromOurWindow(e);
    if (!win) return;
    const action = sizeButtonAction(windowState(win));
    if (action === "leaveFullScreen") win.setFullScreen(false);
    else if (action === "unmaximize") win.unmaximize();
    else win.maximize();
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
  ipcMain.handle(IPC.settingsLoad, (): SettingsSnapshot => ({
    app: settings.current(),
    closeToTray: closeToTraySupport(lifecycle, process.platform),
    currentProject: settings.project,
    projects: settings.project ? [settings.project] : [],
  }));
  ipcMain.handle(IPC.settingsSaveApp, (_e, next: unknown) => settings.apply(normalizeAppSettings(next)));
  // The page may only reach projects main offers it (the current one, until STORY-19 brings the project list).
  const knownProject = (dir: unknown): dir is string => typeof dir === "string" && dir === settings.project?.dir;
  const notOpen = (dir: unknown): ProjectSettings => ({
    dir: String(dir),
    overrides: {},
    error: "Not an open project.",
  });
  ipcMain.handle(IPC.settingsLoadProject, (_e, dir: unknown) =>
    knownProject(dir) ? readProjectSettings(dir) : notOpen(dir),
  );
  ipcMain.handle(IPC.settingsSetProjectValue, (_e, dir: unknown, key: unknown, value: unknown) => {
    if (!knownProject(dir)) return notOpen(dir);
    if (!WORK_SETTING_KEYS.includes(key as WorkSettingKey)) return readProjectSettings(dir);
    const k = key as WorkSettingKey;
    if (value === null) return writeProjectValue(dir, k, null);
    const valid = normalizeWorkOverrides({ [k]: value });
    return valid[k] !== undefined ? writeProjectValue(dir, k, valid[k]) : readProjectSettings(dir);
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

function destroyTray(tray: Tray) {
  tray.destroy();
  if (testHooks.tray === tray) {
    testHooks.tray = undefined;
    testHooks.trayMenu = undefined;
  }
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
  const settingsStore = createSettingsStore(app.getPath("userData"));
  const log = createLog(join(app.getPath("userData"), "logs"));
  log.info(`Featra ${app.getVersion()} started (${process.platform})`);
  let win: BrowserWindow | undefined;
  let tray: Tray | undefined;

  void app.whenReady().then(async () => {
    if (process.platform === "win32") app.setAppUserModelId("dev.featra.app"); // notifications need it on Windows
    setNativeMenu();
    const [remembered, hasTray, stored, project] = await Promise.all([
      appState.load(),
      trayAvailable(),
      settingsStore.load(),
      findProject(process.cwd(), process.env.FEATRA_PROJECT_DIR),
    ]);
    let appSettings = stored;
    if (process.platform !== "darwin") log.info(hasTray ? "Tray available" : "No tray: close quits");
    log.info(project ? `Project: ${project.dir}` : "No project");
    const lifecycle = createLifecycle({
      platform: process.platform,
      // Settings > General > Close button: keep running in the tray (the default) or quit.
      closeToTray: appSettings.closeButton === "tray",
      trayAvailable: hasTray,
      noticeShown: remembered.trayNoticeShown,
      notify: showNotice,
      rememberNotice: () => void appState.save({ trayNoticeShown: true }),
      exit: () => app.quit(),
    });
    // The tray icon is there while close keeps Featra running, and goes when the Close button is set to quit.
    const syncTray = (w: BrowserWindow) => {
      if (lifecycle.usesTray && !tray) tray = createTray(w, lifecycle);
      else if (!lifecycle.usesTray && tray) {
        destroyTray(tray);
        tray = undefined;
      }
    };
    registerIpc({
      store,
      lifecycle,
      log,
      settings: {
        store: settingsStore,
        current: () => appSettings,
        project,
        async apply(next) {
          const closeChanged = next.closeButton !== appSettings.closeButton;
          appSettings = next;
          if (closeChanged) {
            lifecycle.setCloseToTray(next.closeButton === "tray");
            log.info(`Close button: ${next.closeButton === "tray" ? "keep running" : "quit"}`);
            if (win && !win.isDestroyed()) syncTray(win);
          }
          await settingsStore.save(next);
        },
      },
      troubleshoot: {
        session: session.defaultSession,
        stores: [store, appState, settingsStore],
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
    nativeTheme.themeSource = appSettings.theme;
    win = createWindow();
    win.on("hide", () => log.info("Window hidden"));
    win.on("show", () => log.info("Window shown"));
    lifecycle.manage(win);
    syncTray(win);
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
    void Promise.all([store.flush(), appState.flush(), settingsStore.flush(), log.flush()]).finally(() => app.exit(0));
  });

  // Only reached when close-to-tray is off or the app is quitting.
  app.on("window-all-closed", () => {
    if (tray) destroyTray(tray);
    tray = undefined;
    if (process.platform !== "darwin") app.quit();
  });
}
