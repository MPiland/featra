import { describe, expect, it } from "vitest";
import { browserBridge, DEFAULT_UI_STATE, normalizeUiState } from "../src/bridge.ts";

describe("stored UI state", () => {
  it("falls back to defaults for missing or malformed values", () => {
    expect(normalizeUiState(null)).toEqual(DEFAULT_UI_STATE);
    expect(normalizeUiState("nope")).toEqual(DEFAULT_UI_STATE);
    expect(normalizeUiState({ sidebarCollapsed: "yes" })).toEqual(DEFAULT_UI_STATE);
    expect(normalizeUiState({ sidebarCollapsed: true, extra: 1 })).toEqual({ sidebarCollapsed: true });
  });

  it("starts with the sidebar open", () => {
    expect(DEFAULT_UI_STATE.sidebarCollapsed).toBe(false);
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
    await browserBridge(fake).uiState.save({ sidebarCollapsed: true });
    expect(await browserBridge(fake).uiState.load()).toEqual({ sidebarCollapsed: true });
  });

  it("recovers from corrupt storage", async () => {
    const fake = { getItem: () => "{not json", setItem() {} } as unknown as Storage;
    expect(await browserBridge(fake).uiState.load()).toEqual(DEFAULT_UI_STATE);
  });
});
