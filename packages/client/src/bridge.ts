/**
 * The contract between the UI and its host. Electron's preload implements it; a plain browser (Vite dev, later
 * remote control) gets the fallback below. The UI never talks to Electron any other way.
 */
import { httpsLink } from "@featra/work-format/prs";
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  normalizeProjectSettings,
  normalizeSettingsSnapshot,
  type AppSettings,
  type ProjectSettings,
  type SettingsSnapshot,
  type WorkSettingKey,
  type WorkSettings,
} from "./settings.ts";
import { noChats, type ChatBridge } from "./chats.ts";
import { noChecks, type ChecksBridge } from "./checks-bridge.ts";
import { noInbox, noNotifications, type InboxBridge, type NotificationsBridge } from "./inbox.ts";
import { noNeeds, type NeedsBridge } from "./needs.ts";
import { noRoles, type RolesBridge } from "./roles-bridge.ts";
import { noSetup, type ProjectSetupBridge } from "./project-setup.ts";
import { EMPTY_PROJECTS, type ProjectsResult, type ProjectsSnapshot } from "./projects.ts";
import { noWork, type WorkBridge } from "./work-list.ts";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";
import { DEFAULT_UI_STATE, normalizeUiState, type UiState } from "./ui-state.ts";
import { DEFAULT_WINDOW_STATE, type WindowState } from "./window-state.ts";

export { THEME_CHOICES, type ThemeChoice };
export * from "./chats.ts";
export * from "./checks-bridge.ts";
export * from "./inbox.ts";
export * from "./needs.ts";
export * from "./project-setup.ts";
export * from "./projects.ts";
export * from "./roles-bridge.ts";
export * from "./server-client.ts";
export * from "./settings.ts";
export * from "./ui-state.ts";
export * from "./work-list.ts";
export * from "./window-state.ts";

/** Text-editing commands; the host runs them on whatever field has focus. */
export type EditCommand = "undo" | "redo" | "cut" | "copy" | "paste" | "delete" | "selectAll";
export const EDIT_COMMANDS: readonly EditCommand[] = ["undo", "redo", "cut", "copy", "paste", "delete", "selectAll"];

export interface AppInfo {
  name: string;
  version: string;
}

export interface FeatraBridge {
  /** `process.platform` of the host: "win32", "darwin", "linux", or "web" outside Electron. */
  readonly platform: string;
  readonly uiState: {
    load: () => Promise<UiState>;
    save: (state: UiState) => Promise<void>;
  };
  readonly window: {
    minimize: () => void;
    /** Maximize, restore, or leave full screen: see `sizeButtonAction`. */
    toggleMaximize: () => void;
    close: () => void;
    toggleFullScreen: () => void;
    state: () => Promise<WindowState>;
    /** Calls back on every change to the window's state; returns the unsubscribe. */
    onStateChange: (listener: (state: WindowState) => void) => () => void;
    setZoomFactor: (factor: number) => void;
    /** Pins native surfaces to the app setting's theme (System lets the OS decide). */
    setTheme: (theme: ThemeChoice) => void;
  };
  readonly settings: {
    /** App settings, what the close button can do here, and the projects the Project scope can pick from. */
    load: () => Promise<SettingsSnapshot>;
    /** Stores app settings; the host applies them at once (the close button among them, without a restart). */
    saveApp: (settings: AppSettings) => Promise<void>;
    /** A project's overrides, read from its `.featra/config.yaml`. */
    loadProject: (dir: string) => Promise<ProjectSettings>;
    /** Overrides one work setting in the project's config file, or removes the override (`null`). */
    setProjectValue: <K extends WorkSettingKey>(
      dir: string,
      key: K,
      value: WorkSettings[K] | null,
    ) => Promise<ProjectSettings>;
  };
  readonly projects: {
    /** The known projects and the current one. */
    list: () => Promise<ProjectsSnapshot>;
    /** Makes a known project the current one. */
    switchTo: (dir: string) => Promise<ProjectsResult>;
    /** Asks for a folder (the OS folder dialog), adds it and switches to it. Null when the user cancels. */
    openFolder: () => Promise<ProjectsResult | null>;
    /** Asks for a folder to create a new project in, starting at `from`. Null when the user cancels. */
    chooseLocation: (from: string) => Promise<string | null>;
    /** Creates the folder `name` in `location`, adds it and switches to it. */
    create: (location: string, name: string) => Promise<ProjectsResult>;
  };
  /** Git and Featra init for a project folder, done by the local server (ADR 0015). */
  readonly setup: ProjectSetupBridge;
  /** The project's live Work list and the stale-copy actions, from the local server (ADR 0016). */
  readonly work: WorkBridge;
  /** Chats started from roles, run by the local server (ADR 0018). */
  readonly chats: ChatBridge;
  /** The project's roles and their edits, from the local server (STORY-6). */
  readonly roles: RolesBridge;
  /** Where checks run and the check commands, from the local server (STORY-56). */
  readonly checks: ChecksBridge;
  /** The requests waiting on the user past the Inbox wait, from the local server (STORY-7). */
  readonly inbox: InboxBridge;
  /** What every open project needs from the user, from the local server (STORY-66). */
  readonly needs: NeedsBridge;
  /** Desktop notifications for the requests that arrive (STORY-7); the host decides when to show one. */
  readonly notifications: NotificationsBridge;
  edit: (command: EditCommand) => void;
  readonly app: {
    info: () => Promise<AppInfo>;
    reload: () => void;
    toggleDevTools: () => void;
    /** Shows the main process's log file in the OS file manager. */
    showLogs: () => void;
    /** Opens an https link (a story's PR) in the OS browser; anything else is ignored. */
    openExternal: (url: string) => void;
    /** Opens the server's copy of an evidence file with the OS (STORY-72); anything else is ignored. */
    openEvidence: (file: string) => void;
    /** Opens a story's dev server, on this computer, in a Featra window (STORY-25); anything else is ignored. */
    openPreview: (url: string, title: string) => void;
    /** Puts text on the clipboard (STORY-68's Copy on a command); nothing runs it. */
    copyText: (text: string) => void;
    /** Clears Chromium's HTTP cache, then restarts the app. */
    clearCacheAndRestart: () => void;
    /** Deletes stored state (window chrome, app state, web storage, cache), then restarts. Logs are kept. */
    resetAppData: () => void;
    quit: () => void;
  };
}

/** IPC channel names shared by preload and main. */
export const IPC = {
  uiStateLoad: "ui-state:load",
  uiStateSave: "ui-state:save",
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowToggleFullScreen: "window:toggle-full-screen",
  windowGetState: "window:get-state",
  windowStateChanged: "window:state-changed",
  windowSetZoom: "window:set-zoom",
  windowSetTheme: "window:set-theme",
  edit: "edit:run",
  appInfo: "app:info",
  appReload: "app:reload",
  appToggleDevTools: "app:toggle-devtools",
  appShowLogs: "app:show-logs",
  appOpenExternal: "app:open-external",
  appOpenEvidence: "app:open-evidence",
  appOpenPreview: "app:open-preview",
  appCopyText: "app:copy-text",
  appClearCacheAndRestart: "app:clear-cache-and-restart",
  appResetAppData: "app:reset-app-data",
  appQuit: "app:quit",
  settingsLoad: "settings:load",
  settingsSaveApp: "settings:save-app",
  settingsLoadProject: "settings:load-project",
  settingsSetProjectValue: "settings:set-project-value",
  projectsList: "projects:list",
  projectsSwitch: "projects:switch",
  projectsOpenFolder: "projects:open-folder",
  projectsChooseLocation: "projects:choose-location",
  projectsCreate: "projects:create",
  serverEndpoint: "server:endpoint",
  notificationsAsked: "notifications:asked",
  notificationsOpenChat: "notifications:open-chat",
} as const;

declare global {
  interface Window {
    featra?: FeatraBridge;
  }
}

const STORAGE_KEY = "featra.ui-state";
const SETTINGS_KEY = "featra.settings";

const NO_FOLDERS = "No project folder in a browser tab.";
const noProject = (dir: string): ProjectSettings => normalizeProjectSettings({ error: NO_FOLDERS }, dir);
const noFolders: ProjectsResult = { ok: false, error: NO_FOLDERS };

/**
 * Used when the UI runs in a plain browser: state lives in localStorage and there is no window to control, nor a
 * project folder to read.
 */
export function browserBridge(storage: Storage = window.localStorage): FeatraBridge {
  const readSettings = (): AppSettings => {
    try {
      return normalizeAppSettings(JSON.parse(storage.getItem(SETTINGS_KEY) ?? "null"));
    } catch {
      return { ...DEFAULT_APP_SETTINGS };
    }
  };
  return {
    platform: "web",
    uiState: {
      async load() {
        try {
          return normalizeUiState(JSON.parse(storage.getItem(STORAGE_KEY) ?? "null"));
        } catch {
          return { ...DEFAULT_UI_STATE };
        }
      },
      async save(state) {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      },
    },
    window: {
      minimize() {},
      toggleMaximize() {},
      close() {},
      toggleFullScreen() {},
      state: async () => ({ ...DEFAULT_WINDOW_STATE }),
      onStateChange: () => () => {},
      setZoomFactor: (factor) => {
        document.documentElement.style.zoom = String(factor);
      },
      setTheme() {},
    },
    settings: {
      load: async () => normalizeSettingsSnapshot({ app: readSettings(), closeToTray: null }),
      async saveApp(settings) {
        storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeAppSettings(settings)));
      },
      loadProject: async (dir) => noProject(dir),
      setProjectValue: async (dir) => noProject(dir),
    },
    projects: {
      list: async () => ({ ...EMPTY_PROJECTS }),
      switchTo: async () => noFolders,
      openFolder: async () => noFolders,
      chooseLocation: async () => null,
      create: async () => noFolders,
    },
    setup: noSetup(NO_FOLDERS),
    work: noWork(NO_FOLDERS),
    chats: noChats(NO_FOLDERS),
    roles: noRoles(NO_FOLDERS),
    checks: noChecks(NO_FOLDERS),
    inbox: noInbox(),
    needs: noNeeds(),
    notifications: noNotifications(),
    edit: (command) => {
      document.execCommand(command);
    },
    app: {
      info: async () => ({ name: "Featra", version: "dev" }),
      reload: () => window.location.reload(),
      toggleDevTools() {},
      showLogs() {},
      openExternal: (url) => {
        const link = httpsLink(url);
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      },
      openEvidence() {},
      openPreview() {},
      copyText: (text) => {
        navigator.clipboard?.writeText(text).catch(() => {});
      },
      clearCacheAndRestart() {},
      resetAppData() {},
      quit() {},
    },
  };
}

export function getBridge(): FeatraBridge {
  return window.featra ?? browserBridge();
}
