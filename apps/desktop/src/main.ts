import { join } from "node:path";
import { IPC } from "@featra/client/bridge";
import { app, BrowserWindow, nativeTheme, Notification, session, type Tray } from "electron";
import { applyDockIcon } from "./app-icon.ts";
import { APP_ID, nameApp } from "./app-name.ts";
import { takeInstanceLock } from "./instance-lock.ts";
import { allowedDirs, registerIpc } from "./ipc.ts";
import { createLifecycle, onWslg } from "./lifecycle.ts";
import { createLog, type Log } from "./log.ts";
import { readLoginPath, readsLoginPath } from "./login-path.ts";
import { createNotifier } from "./notifier.ts";
import { keepBadgeOn } from "./badge-window.ts";
import { createOsBadge } from "./os-badge.ts";
import { createTrayBadge } from "./tray-badge.ts";
import { setNativeMenu } from "./native-menu.ts";
import { createProjectRegistry, findProject } from "./project-registry.ts";
import { capturePage, mayNavigate } from "./dev-pages.ts";
import { createServerProcess, startAfter } from "./server-process.ts";
import { createSettingsStore } from "./settings-store.ts";
import { e2e, testHooks } from "./test-hooks.ts";
import { createTray, destroyTray, trayAvailable } from "./tray.ts";
import { createAppStateStore, createUiStateStore } from "./ui-state-store.ts";
import { createWindow, windowBackground } from "./window.ts";
import { clientIndex } from "./client-path.ts";

/**
 * The app's lifecycle: one instance, its stores and log, the window, the tray and quitting. The window, the IPC the
 * page calls, the native menu and the tray each live in their own module.
 */

nameApp(app);
// Tests (and anyone running a second profile) point userData at their own folder. Must happen before `ready`.
const userDataDir = process.env.FEATRA_USER_DATA_DIR;
if (userDataDir) app.setPath("userData", userDataDir);

/**
 * Installed on macOS and Linux, takes the login shell's PATH, so the app, its server and the agents it starts find `git`,
 * `gh` and `claude` when opened from Finder, the Dock or a desktop menu (STORY-64). Read while the window opens; the
 * server starts once it has been.
 */
async function takeLoginPath(log: Log) {
  if (!readsLoginPath(process.platform, app.isPackaged)) return;
  const found = await readLoginPath({ platform: process.platform, env: process.env });
  process.env.PATH = found.path;
  log.info(
    found.source === "login shell"
      ? `PATH from the login shell (${found.shell})`
      : `The login shell (${found.shell}) gave no PATH: ${found.reason}. Added the usual folders.`,
  );
}

function showNotice(message: string) {
  if (e2e) testHooks.notices.push(message);
  else if (Notification.isSupported()) new Notification({ title: "Featra", body: message }).show();
}

// The window only ever shows the bundled client: no navigation away, no pop-up windows. A Preview window moves only
// within its story's dev server (STORY-25).
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (e, url) => {
    if (!mayNavigate(contents, url)) e.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

if (!takeInstanceLock(app, userDataDir)) {
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
  let win: BrowserWindow | undefined;
  // The taskbar and Dock badge: the agents waiting on the user across every open project, as the server counts them.
  const badge = createOsBadge(
    () => win,
    (message) => log.info(message),
  );
  const trayBadge = createTrayBadge();
  // The local server makes every project write (ADR 0012, ADR 0015). It runs on Electron's own Node, with the PATH.
  const server = startAfter(
    takeLoginPath(log),
    createServerProcess({
      script: join(app.getAppPath(), "dist", "server.cjs"),
      mcpEntry: join(app.getAppPath(), "dist", "mcp.cjs"),
      execPath: process.execPath,
      log: (message) => log.info(message),
      dataDir: app.getPath("userData"),
      // The server asks for a story's pages as it moves to review (STORY-25, ADR 0044).
      capture: (url) => app.whenReady().then(() => capturePage(url)),
      waiting: (count) =>
        void app.whenReady().then(() => {
          badge.show(count);
          trayBadge.show(count);
        }),
    }),
  );
  // The quit's stop of the server: the app exits once the server has (it stops the dev servers it started first).
  let serverStopped: Promise<void> = Promise.resolve();
  const client = clientIndex({ appPath: app.getAppPath(), packaged: app.isPackaged });
  let tray: Tray | undefined;

  void app.whenReady().then(async () => {
    if (process.platform === "win32") app.setAppUserModelId(APP_ID); // notifications need it on Windows
    applyDockIcon(app.dock, process.platform);
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
      if (lifecycle.usesTray && !tray) tray = createTray(w, lifecycle, trayBadge);
      else if (!lifecycle.usesTray && tray) {
        destroyTray(tray, trayBadge);
        tray = undefined;
      }
    };
    // Desktop notifications for the requests that arrive (STORY-7). Held until closed, so none is collected early.
    const shown = new Set<Notification>();
    const inFront = () => !!win && !win.isDestroyed() && win.isVisible() && win.isFocused();
    const notifier = createNotifier({
      enabled: () => appSettings.notifications,
      focused: () => (e2e ? (testHooks.focused ?? inFront()) : inFront()),
      show: ({ title, body, click }) => {
        if (e2e) {
          const shownToast = { title, body, click };
          testHooks.notifications.push(shownToast);
          return {
            close() {
              const at = testHooks.notifications.indexOf(shownToast);
              if (at >= 0) testHooks.notifications.splice(at, 1);
            },
          };
        }
        if (!Notification.isSupported()) return undefined;
        const n = new Notification({ title, body });
        shown.add(n);
        n.on("click", click);
        n.on("close", () => shown.delete(n));
        n.show();
        return { close: () => n.close() };
      },
      open: (chat, projectDir) => {
        if (!win || win.isDestroyed()) return;
        lifecycle.reveal(win);
        win.webContents.send(IPC.notificationsOpenChat, { chat, project: projectDir });
      },
    });
    registerIpc({
      notifier,
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
      serverStopped = server.stop();
      if (!loggedQuit) log.info("Quitting");
      loggedQuit = true;
    });

    // Only reached when close doesn't hide the window (the Close button is set to Quit).
    app.on("window-all-closed", () => {
      if (tray) destroyTray(tray, trayBadge);
      tray = undefined;
      lifecycle.allWindowsClosed();
    });

    // A second launch (Start menu, shortcut) brings back the running app's window instead of starting another app.
    app.on("second-instance", () => {
      if (win && !win.isDestroyed()) lifecycle.reveal(win);
    });
    /** The window, logged as it hides and shows, keeping the badge on its taskbar button, managed by the lifecycle. */
    const openWindow = () => {
      const w = createWindow(client);
      w.on("hide", () => log.info("Window hidden"));
      w.on("show", () => log.info("Window shown"));
      keepBadgeOn(w, badge);
      lifecycle.manage(w);
      return w;
    };
    // macOS: clicking the Dock icon brings the hidden window back.
    app.on("activate", () => {
      if (win && !win.isDestroyed()) lifecycle.reveal(win);
      else win = openWindow();
    });

    // Apply a pinned theme before the window exists so its background matches from the first frame.
    nativeTheme.themeSource = appSettings.theme;
    win = openWindow();
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
      // On Windows the app's exit ends the server process at once, and the dev servers it hadn't stopped yet would
      // keep running (STORY-25). A server that doesn't exit in time is ended (server-process.ts).
      serverStopped,
    ]).finally(() => app.exit(0));
  });
}
