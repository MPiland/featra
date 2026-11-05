import { contextBridge, ipcRenderer } from "electron";
import { IPC, normalizeUiState, type FeatraBridge } from "@featra/client/bridge";

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
    setZoomFactor: (factor) => ipcRenderer.send(IPC.windowSetZoom, factor),
    setTheme: (theme) => ipcRenderer.send(IPC.windowSetTheme, theme),
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
