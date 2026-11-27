/** Window chrome state that survives a restart, read back defensively. Part of the host contract (bridge.ts). */
import { isRecord } from "@featra/work-format/guards";
import { normalizeDevicesByProject, type BrowserDevices } from "./browser-devices.ts";
import { normalizePaneWidth } from "./pane-width.ts";
import { normalizeBoardProjects } from "./work-layout.ts";
import { DEFAULT_ZOOM, normalizeZoom } from "./zoom.ts";

/** Window chrome state that survives a restart. The theme is an app setting (Settings > Appearance), not chrome. */
export interface UiState {
  sidebarCollapsed: boolean;
  zoomFactor: number;
  /** The card pane width the user chose by its handle; null for the default (STORY-4, `pane-width.ts`). */
  cardPaneWidth: number | null;
  /** The projects whose Work shows the stage board (STORY-17, `work-layout.ts`); left out while every one shows the list. */
  boardProjects?: string[];
  /** The Browser pane width the user chose by its handle; left out for the default (STORY-74). */
  browserPaneWidth?: number;
  /** Each project's device toolbar choice and added devices (STORY-74, `browser-devices.ts`), by folder. */
  browserDevices?: Record<string, BrowserDevices>;
}

export const DEFAULT_UI_STATE: UiState = {
  sidebarCollapsed: false,
  zoomFactor: DEFAULT_ZOOM,
  cardPaneWidth: null,
};

/** Reads stored state defensively: unknown or malformed fields fall back to defaults. */
export function normalizeUiState(raw: unknown): UiState {
  const r = isRecord(raw) ? raw : {};
  const boardProjects = normalizeBoardProjects(r.boardProjects);
  const browserDevices = normalizeDevicesByProject(r.browserDevices);
  const browserPaneWidth = normalizePaneWidth(r.browserPaneWidth);
  return {
    sidebarCollapsed: typeof r.sidebarCollapsed === "boolean" ? r.sidebarCollapsed : DEFAULT_UI_STATE.sidebarCollapsed,
    zoomFactor: normalizeZoom(r.zoomFactor),
    cardPaneWidth: normalizePaneWidth(r.cardPaneWidth),
    ...(boardProjects.length ? { boardProjects } : {}),
    ...(browserPaneWidth !== null ? { browserPaneWidth } : {}),
    ...(Object.keys(browserDevices).length ? { browserDevices } : {}),
  };
}
