import { contextBridge, ipcRenderer } from "electron";
import {
  createServerClient,
  IPC,
  normalizeEndpoint,
  normalizeAppSettings,
  createAnnotationsReader,
  normalizeBrowserState,
  normalizeProjectSettings,
  normalizeProjects,
  normalizeProjectsResult,
  normalizeSettingsSnapshot,
  normalizeUiState,
  normalizeWindowState,
  serverBrowser,
  serverChats,
  serverChecks,
  serverInbox,
  serverNeeds,
  serverRoles,
  serverSetup,
  serverWork,
  type FeatraBridge,
} from "@featra/client/bridge";

// The local server's WebSocket (ADR 0015). Main hands out its address and token; the page never sees either.
const server = createServerClient(async () => normalizeEndpoint(await ipcRenderer.invoke(IPC.serverEndpoint)));

/** Each screenshot comes once (STORY-75): the open pane's reader keeps those it was sent, for every listener. */
let annotations: { key: string; read: ReturnType<typeof createAnnotationsReader> } | null = null;
function readAnnotations(key: string, state: unknown) {
  if (annotations?.key !== key) annotations = { key, read: createAnnotationsReader() };
  return annotations.read(state);
}

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
  needs: serverNeeds(server),
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
  // The Browser pane (STORY-74): its dev server from the local server, its page from main.
  browser: {
    ...serverBrowser(server),
    open: (key, target) => ipcRenderer.send(IPC.browserOpen, key, target),
    focus: (key) => ipcRenderer.send(IPC.browserFocus, key),
    onEscape: (listener) => {
      const handler = (_e: unknown, key: unknown) => {
        if (typeof key === "string") listener(key);
      };
      ipcRenderer.on(IPC.browserEscape, handler);
      return () => void ipcRenderer.removeListener(IPC.browserEscape, handler);
    },
    layout: (key, layout) => ipcRenderer.send(IPC.browserLayout, key, layout),
    navigate: (key, url) => ipcRenderer.send(IPC.browserNavigate, key, url),
    back: (key) => ipcRenderer.send(IPC.browserBack, key),
    forward: (key) => ipcRenderer.send(IPC.browserForward, key),
    reload: (key) => ipcRenderer.send(IPC.browserReload, key),
    close: (key) => ipcRenderer.send(IPC.browserClose, key),
    onState: (listener) => {
      const handler = (_e: unknown, key: unknown, state: unknown) => {
        if (typeof key === "string") listener(key, normalizeBrowserState(state));
      };
      ipcRenderer.on(IPC.browserState, handler);
      return () => void ipcRenderer.removeListener(IPC.browserState, handler);
    },
    // Annotate (STORY-75): the main process owns each pane's annotations; the window shows them and asks for changes.
    annotate: (key, on) => ipcRenderer.send(IPC.browserAnnotate, key, on),
    editAnnotation: (key, id) => ipcRenderer.send(IPC.browserAnnotationEdit, key, id),
    comment: (key, id, text) => ipcRenderer.send(IPC.browserAnnotationComment, key, id, text),
    removeAnnotation: (key, id) => ipcRenderer.send(IPC.browserAnnotationRemove, key, id),
    onAnnotations: (listener) => {
      const handler = (_e: unknown, key: unknown, state: unknown) => {
        if (typeof key !== "string") return;
        listener(key, readAnnotations(key, state));
      };
      ipcRenderer.on(IPC.browserAnnotations, handler);
      return () => void ipcRenderer.removeListener(IPC.browserAnnotations, handler);
    },
  },
  edit: (command) => ipcRenderer.send(IPC.edit, command),
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    reload: () => ipcRenderer.send(IPC.appReload),
    toggleDevTools: () => ipcRenderer.send(IPC.appToggleDevTools),
    showLogs: () => ipcRenderer.send(IPC.appShowLogs),
    openExternal: (url: string) => ipcRenderer.send(IPC.appOpenExternal, url),
    openEvidence: (file: string) => ipcRenderer.send(IPC.appOpenEvidence, file),
    openPreview: (url: string, title: string) => ipcRenderer.send(IPC.appOpenPreview, url, title),
    copyText: (text: string) => ipcRenderer.send(IPC.appCopyText, text),
    clearCacheAndRestart: () => ipcRenderer.send(IPC.appClearCacheAndRestart),
    resetAppData: () => ipcRenderer.send(IPC.appResetAppData),
    quit: () => ipcRenderer.send(IPC.appQuit),
  },
};

contextBridge.exposeInMainWorld("featra", bridge);
