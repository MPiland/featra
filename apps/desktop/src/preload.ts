import { contextBridge, ipcRenderer } from "electron";
import {
  createServerClient,
  IPC,
  normalizeEndpoint,
  normalizeAppSettings,
  normalizeProjectSettings,
  normalizeProjects,
  normalizeProjectsResult,
  normalizeSettingsSnapshot,
  normalizeUiState,
  normalizeWindowState,
  serverChats,
  serverChecks,
  serverInbox,
  serverRoles,
  serverSetup,
  serverWork,
  type FeatraBridge,
} from "@featra/client/bridge";

// The local server's WebSocket (ADR 0015). Main hands out its address and token; the page never sees either.
const server = createServerClient(async () => normalizeEndpoint(await ipcRenderer.invoke(IPC.serverEndpoint)));

const bridge: FeatraBridge = {
  platform: process.platform,
  uiState: {
    load: async () => normalizeUiState(await ipcRenderer.invoke(IPC.uiStateLoad)),
    save: async (state) => {
      await ipcRenderer.invoke(IPC.uiStateSave, normalizeUiState(state));
    },
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
    toggleFullScreen: () => ipcRenderer.send(IPC.windowToggleFullScreen),
    state: async () => normalizeWindowState(await ipcRenderer.invoke(IPC.windowGetState)),
    onStateChange: (listener) => {
      const handler = (_e: unknown, state: unknown) => listener(normalizeWindowState(state));
      ipcRenderer.on(IPC.windowStateChanged, handler);
      return () => void ipcRenderer.removeListener(IPC.windowStateChanged, handler);
    },
    setZoomFactor: (factor) => ipcRenderer.send(IPC.windowSetZoom, factor),
    setTheme: (theme) => ipcRenderer.send(IPC.windowSetTheme, theme),
  },
  settings: {
    load: async () => normalizeSettingsSnapshot(await ipcRenderer.invoke(IPC.settingsLoad)),
    saveApp: async (settings) => {
      await ipcRenderer.invoke(IPC.settingsSaveApp, normalizeAppSettings(settings));
    },
    loadProject: async (dir) => normalizeProjectSettings(await ipcRenderer.invoke(IPC.settingsLoadProject, dir), dir),
    setProjectValue: async (dir, key, value) =>
      normalizeProjectSettings(await ipcRenderer.invoke(IPC.settingsSetProjectValue, dir, key, value), dir),
  },
  projects: {
    list: async () => normalizeProjects(await ipcRenderer.invoke(IPC.projectsList)),
    switchTo: async (dir) => normalizeProjectsResult(await ipcRenderer.invoke(IPC.projectsSwitch, dir)),
    openFolder: async () => {
      const result: unknown = await ipcRenderer.invoke(IPC.projectsOpenFolder);
      return result === null ? null : normalizeProjectsResult(result);
    },
    chooseLocation: async (from) => {
      const dir: unknown = await ipcRenderer.invoke(IPC.projectsChooseLocation, from);
      return typeof dir === "string" && dir ? dir : null;
    },
    create: async (location, name) =>
      normalizeProjectsResult(await ipcRenderer.invoke(IPC.projectsCreate, location, name)),
  },
  setup: serverSetup(server),
  work: serverWork(server),
  chats: serverChats(server),
  roles: serverRoles(server),
  checks: serverChecks(server),
  inbox: serverInbox(server),
  notifications: {
    asked: (item) => ipcRenderer.send(IPC.notificationsAsked, item),
    onOpenChat: (listener) => {
      const handler = (_e: unknown, target: unknown) => {
        const { chat, project } = (target ?? {}) as { chat?: unknown; project?: unknown };
        if (typeof chat === "string") listener(chat, typeof project === "string" ? project : undefined);
      };
      ipcRenderer.on(IPC.notificationsOpenChat, handler);
      return () => void ipcRenderer.removeListener(IPC.notificationsOpenChat, handler);
    },
  },
  edit: (command) => ipcRenderer.send(IPC.edit, command),
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    reload: () => ipcRenderer.send(IPC.appReload),
    toggleDevTools: () => ipcRenderer.send(IPC.appToggleDevTools),
    showLogs: () => ipcRenderer.send(IPC.appShowLogs),
    clearCacheAndRestart: () => ipcRenderer.send(IPC.appClearCacheAndRestart),
    resetAppData: () => ipcRenderer.send(IPC.appResetAppData),
    quit: () => ipcRenderer.send(IPC.appQuit),
  },
};

contextBridge.exposeInMainWorld("featra", bridge);
