import { join } from "node:path";
import { app, BrowserWindow, nativeTheme, Notification, session, type Tray } from "electron";
import { allowedDirs, registerIpc } from "./ipc.ts";
import { createLifecycle, onWslg } from "./lifecycle.ts";
import { createLog } from "./log.ts";
import { setNativeMenu } from "./native-menu.ts";
import { createProjectRegistry, findProject } from "./project-registry.ts";
import { createServerProcess } from "./server-process.ts";
import { createSettingsStore } from "./settings-store.ts";
import { e2e, testHooks } from "./test-hooks.ts";
import { createTray, destroyTray, trayAvailable } from "./tray.ts";
import { createAppStateStore, createUiStateStore } from "./ui-state-store.ts";
import { createWindow, windowBackground } from "./window.ts";

/**
 * The app's lifecycle: one instance, its stores and log, the window, the tray and quitting. The window, the IPC the
 * page calls, the native menu and the tray each live in their own module.
 */

// Tests (and anyone running a second profile) point userData at their own folder. Must happen before `ready`.
const userDataDir = process.env.FEATRA_USER_DATA_DIR;
if (userDataDir) app.setPath("userData", userDataDir);

function showNotice(message: string) {
  if (e2e) testHooks.notices.push(message);
  else if (Notification.isSupported()) new Notification({ title: "Featra", body: message }).show();
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
  // Not among Reset App Data's stores: the user's projects are kept.
  const projects = createProjectRegistry({
    dir: app.getPath("userData"),
    platform: process.platform,
    fallbackLocation: app.getPath("documents"),
  });
  log.info(`Featra ${app.getVersion()} started (${process.platform})`);
  // The local server makes every project write (ADR 0012, ADR 0015). It runs on Electron's own Node.
  const server = createServerProcess({
    script: join(app.getAppPath(), "dist", "server.cjs"),
    execPath: process.execPath,
    log: (message) => log.info(message),
    dataDir: app.getPath("userData"),
  });
  let win: BrowserWindow | undefined;
  let tray: Tray | undefined;

  void app.whenReady().then(async () => {
    if (process.platform === "win32") app.setAppUserModelId("dev.featra.app"); // notifications need it on Windows
    setNativeMenu();
    const [remembered, hasTray, stored] = await Promise.all([
      appState.load(),
      trayAvailable(),
      settingsStore.load(),
      findProject(process.cwd(), process.env.FEATRA_PROJECT_DIR).then(projects.start),
    ]);
    const project = projects.current();
    void projects.snapshot().then((s) => server.setProjects(allowedDirs(s)));
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
      remapOnReveal: onWslg(process.platform, process.env),
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
      projects,
      server,
      settings: {
        store: settingsStore,
        current: () => appSettings,
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
      // A server main stops logs nothing, so "Quitting" stays the log's last line.
      void server.stop();
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
    void Promise.all([
      store.flush(),
      appState.flush(),
      settingsStore.flush(),
      projects.store.flush(),
      log.flush(),
    ]).finally(() => app.exit(0));
  });

  // Only reached when close-to-tray is off or the app is quitting.
  app.on("window-all-closed", () => {
    if (tray) destroyTray(tray);
    tray = undefined;
    if (process.platform !== "darwin") app.quit();
  });
}
