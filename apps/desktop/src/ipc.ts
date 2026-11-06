import { app, BrowserWindow, ipcMain, nativeTheme, shell, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
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
  type ProjectRef,
  type ProjectSettings,
  type SettingsSnapshot,
} from "@featra/client/bridge";
import { normalizeZoom } from "@featra/client/zoom";
import { isOneOf, toText } from "@featra/work-format";
import { closeToTraySupport, type Lifecycle } from "./lifecycle.ts";
import type { Log } from "./log.ts";
import { readProjectSettings, writeProjectValue, type SettingsStore } from "./settings-store.ts";
import { e2e, testHooks } from "./test-hooks.ts";
import { clearCacheAndRestart, resetAppData, type TroubleshootDeps } from "./troubleshoot.ts";
import type { UiStateStore } from "./ui-state-store.ts";
import { windowState } from "./window.ts";

export interface MainDeps {
  store: UiStateStore;
  lifecycle: Lifecycle;
  log: Log;
  troubleshoot: TroubleshootDeps;
  settings: {
    store: SettingsStore;
    current: () => AppSettings;
    /** Stores new app settings and applies them: the close button at once (the page applies the theme). */
    apply: (next: AppSettings) => Promise<void>;
    project: ProjectRef | null;
  };
}

const fromOurWindow = (e: IpcMainEvent | IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);

const notOpen = (dir: unknown): ProjectSettings => ({
  dir: toText(dir),
  overrides: {},
  error: "Not an open project.",
});

/** Answers the page's calls (see `IPC` in the client's bridge). Every payload is checked: the page is not trusted. */
export function registerIpc({ store, lifecycle, log, troubleshoot, settings }: MainDeps) {
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
    if (isOneOf(THEME_CHOICES, theme)) nativeTheme.themeSource = theme;
  });
  // The same webContents calls Electron's undo/redo/cut/copy/paste/selectAll menu roles make: they act on the
  // focused field.
  ipcMain.on(IPC.edit, (e, command: unknown) => {
    if (isOneOf(EDIT_COMMANDS, command)) e.sender[command]();
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
  ipcMain.handle(IPC.settingsLoadProject, (_e, dir: unknown) =>
    knownProject(dir) ? readProjectSettings(dir) : notOpen(dir),
  );
  ipcMain.handle(IPC.settingsSetProjectValue, (_e, dir: unknown, key: unknown, value: unknown) => {
    if (!knownProject(dir)) return notOpen(dir);
    if (!isOneOf(WORK_SETTING_KEYS, key)) return readProjectSettings(dir);
    if (value === null) return writeProjectValue(dir, key, null);
    const valid = normalizeWorkOverrides({ [key]: value })[key];
    return valid !== undefined ? writeProjectValue(dir, key, valid) : readProjectSettings(dir);
  });
  ipcMain.handle(IPC.appInfo, () => ({ name: "Featra", version: app.getVersion() }));
  ipcMain.on(IPC.appReload, (e) => e.sender.reload());
  ipcMain.on(IPC.appToggleDevTools, (e) => e.sender.toggleDevTools());
  ipcMain.on(IPC.appShowLogs, () => {
    // Flush first, so the file exists and holds everything logged so far.
    void log.flush().then(() => {
      if (e2e) testHooks.shownInFolder.push(log.file);
      else shell.showItemInFolder(log.file);
    });
  });
  ipcMain.on(IPC.appClearCacheAndRestart, () => void clearCacheAndRestart(troubleshoot));
  ipcMain.on(IPC.appResetAppData, () => void resetAppData(troubleshoot));
  ipcMain.on(IPC.appQuit, () => lifecycle.quit());
}
