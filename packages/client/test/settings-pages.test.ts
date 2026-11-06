import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, WORK_SETTING_KEYS, workSettingDef, type SettingsSnapshot } from "../src/settings.ts";
import {
  appDefaultText,
  closeButtonOptions,
  firstSettingsPage,
  resetLabel,
  settingsPages,
  THEME_OPTIONS,
  WORK_GROUPS,
} from "../src/settings-pages.ts";

const snapshot = (closeToTray: SettingsSnapshot["closeToTray"]): SettingsSnapshot => ({
  app: DEFAULT_APP_SETTINGS,
  closeToTray,
  currentProject: null,
  projects: [],
});

describe("settings pages", () => {
  it("lists the App pages, then the Project page; a browser tab has no General page", () => {
    const desktop = settingsPages(snapshot({ available: true, place: "tray" }));
    expect(desktop.map((p) => `${p.scope}:${p.title}`)).toEqual([
      "app:General",
      "app:Appearance",
      "app:Workflow",
      "app:Keyboard shortcuts",
      "project:Workflow",
    ]);
    expect(firstSettingsPage(snapshot({ available: true, place: "tray" }))).toBe("general");
    expect(settingsPages(snapshot(null)).map((p) => p.id)).not.toContain("general");
    expect(firstSettingsPage(snapshot(null))).toBe("appearance");
  });

  it("groups every work setting exactly once", () => {
    expect(WORK_GROUPS.flatMap((g) => g.keys).toSorted()).toEqual(WORK_SETTING_KEYS.toSorted());
  });

  it("names the choices in short, standard words", () => {
    expect(THEME_OPTIONS.map((o) => o.label)).toEqual(["System", "Light", "Dark"]);
    expect(closeButtonOptions({ available: true, place: "tray" }).map((o) => [o.value, o.label])).toEqual([
      ["tray", "Minimize to tray"],
      ["quit", "Quit"],
    ]);
    expect(closeButtonOptions({ available: true, place: "dock" })[0]!.label).toBe("Minimize to Dock");
    expect(closeButtonOptions({ available: false, reason: "x" })[0]!.label).toBe("Minimize to tray");
  });

  it("words an override", () => {
    expect(appDefaultText("Stories")).toBe("App default: Stories");
    expect(resetLabel(workSettingDef("progress").label)).toBe("Reset Feature progress to the app default");
  });
});
