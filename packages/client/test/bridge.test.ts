import { describe, expect, it } from "vitest";
import {
  browserBridge,
  DEFAULT_APP_SETTINGS,
  DEFAULT_UI_STATE,
  normalizeAppSettings,
  normalizeUiState,
} from "../src/bridge.ts";

describe("stored UI state", () => {
  it("falls back to defaults for missing or malformed values", () => {
    expect(normalizeUiState(null)).toEqual(DEFAULT_UI_STATE);
    expect(normalizeUiState("nope")).toEqual(DEFAULT_UI_STATE);
    expect(normalizeUiState({ sidebarCollapsed: "yes" })).toEqual(DEFAULT_UI_STATE);
    expect(normalizeUiState({ sidebarCollapsed: true, extra: 1 })).toEqual({
      ...DEFAULT_UI_STATE,
      sidebarCollapsed: true,
    });
    expect(normalizeUiState({ theme: "sepia", zoomFactor: "big" })).toEqual(DEFAULT_UI_STATE);
    expect(normalizeUiState({ zoomFactor: -1 })).toEqual(DEFAULT_UI_STATE);
    expect(normalizeUiState({ zoomFactor: Number.POSITIVE_INFINITY })).toEqual(DEFAULT_UI_STATE);
  });

  it("keeps a stored theme (an app setting since STORY-20) and snaps a stored zoom to the nearest step", () => {
    for (const theme of ["system", "light", "dark"] as const) expect(normalizeAppSettings({ theme }).theme).toBe(theme);
    expect(normalizeAppSettings({ theme: "sepia" }).theme).toBe("system");
    expect(normalizeUiState({ zoomFactor: 1.25 }).zoomFactor).toBe(1.25);
    expect(normalizeUiState({ zoomFactor: 1.3 }).zoomFactor).toBe(1.25);
    expect(normalizeUiState({ zoomFactor: 9 }).zoomFactor).toBe(2);
  });

  it("starts with the sidebar open, at 100% zoom, following the OS theme", () => {
    expect(DEFAULT_UI_STATE).toEqual({ sidebarCollapsed: false, zoomFactor: 1 });
    expect(DEFAULT_APP_SETTINGS.theme).toBe("system");
  });
});

/** The bridge used outside Electron keeps state in the page's storage. */
describe("browser bridge", () => {
  it("round-trips state through storage", async () => {
    const storage = new Map<string, string>();
    const fake = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    } as Storage;
    const state = { sidebarCollapsed: true, zoomFactor: 1.5 } as const;
    await browserBridge(fake).uiState.save(state);
    expect(await browserBridge(fake).uiState.load()).toEqual(state);
    const app = { ...DEFAULT_APP_SETTINGS, theme: "dark" } as const;
    await browserBridge(fake).settings.saveApp(app);
    expect((await browserBridge(fake).settings.load()).app).toEqual(app);
  });

  it("has no project folders: an empty list, and every folder action says so (STORY-19)", async () => {
    const fake = { getItem: () => null, setItem() {} } as unknown as Storage;
    const { projects } = browserBridge(fake);
    expect(await projects.list()).toEqual({ current: null, projects: [], location: "" });
    const refused = { ok: false, error: "No project folder in a browser tab." };
    expect(await projects.switchTo("/p")).toEqual(refused);
    expect(await projects.openFolder()).toEqual(refused);
    expect(await projects.create("/p", "x")).toEqual(refused);
    expect(await projects.chooseLocation("/p")).toBeNull();
  });

  it("recovers from corrupt storage", async () => {
    const fake = { getItem: () => "{not json", setItem() {} } as unknown as Storage;
    expect(await browserBridge(fake).uiState.load()).toEqual(DEFAULT_UI_STATE);
  });
});
