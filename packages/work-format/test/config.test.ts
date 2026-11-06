import { describe, expect, it } from "vitest";
import {
  ConfigError,
  configOverrides,
  DEFAULT_CONFIG,
  isKnownStatus,
  parseConfig,
  serializeConfig,
  setConfigValue,
  stageCategory,
} from "../src/index.ts";

describe("config", () => {
  it("fills defaults for missing keys and ignores unknown ones", () => {
    expect(parseConfig("progress: tasks\nfoo: 1\n")).toEqual({ ...DEFAULT_CONFIG, progress: "tasks" });
    expect(parseConfig("")).toEqual(DEFAULT_CONFIG);
  });

  it("round-trips", () => {
    expect(parseConfig(serializeConfig(DEFAULT_CONFIG))).toEqual(DEFAULT_CONFIG);
  });

  it.each([
    ["empty stages", "stages: []"],
    ["unnamed stage", "stages: [{ category: done }]"],
    ["bad category", "stages: [{ name: A, category: later }]"],
    ["reserved Cancelled", "stages: [{ name: Cancelled, category: done }]"],
    ["duplicate", "stages: [{ name: A, category: done }, { name: A, category: done }]"],
    ["no done stage", "stages: [{ name: A, category: active }]"],
    ["bad progress", "progress: effort"],
  ])("rejects %s", (_, text) => {
    expect(() => parseConfig(text)).toThrow(ConfigError);
  });

  it("maps statuses to categories; Cancelled and unknown map to nothing", () => {
    expect(stageCategory("In Review", DEFAULT_CONFIG)).toBe("active");
    expect(stageCategory("Done", DEFAULT_CONFIG)).toBe("done");
    expect(stageCategory("Cancelled", DEFAULT_CONFIG)).toBeNull();
    expect(isKnownStatus("Cancelled", DEFAULT_CONFIG)).toBe(true);
    expect(isKnownStatus("Shipped", DEFAULT_CONFIG)).toBe(false);
  });
});

describe("STORY-20: project overrides of the app-wide defaults", () => {
  const appDefaults = { ...DEFAULT_CONFIG, progress: "tasks" as const, requireAccept: false };

  it("keys the file leaves out come from the app-wide defaults; keys it sets override them", () => {
    expect(parseConfig("worktrees: false\n", appDefaults)).toEqual({ ...appDefaults, worktrees: false });
    expect(parseConfig("progress: stories\n", appDefaults).progress).toBe("stories");
  });

  it("lists only the keys the file sets as overrides", () => {
    expect(configOverrides("# Featra project settings\nversion: 1\nrequireAccept: false\nhierarchy: x\n")).toEqual({
      version: 1,
      requireAccept: false,
    });
    expect(configOverrides("")).toEqual({});
  });

  it.each([
    ["a non-boolean switch", "requireAccept: yes-please"],
    ["an unknown knowledge permission", "knowledge: everything"],
    ["a list instead of settings", "- a\n- b"],
  ])("rejects %s", (_, text) => {
    expect(() => configOverrides(text)).toThrow(ConfigError);
  });

  it("sets a key in place, keeping comments, key order and keys Featra doesn't know (a comment keeps one space before it)", () => {
    const text = "# Featra project settings\nversion: 1\nhierarchy: epic-feature-story-task\nprogress: stories        # stories | tasks\nmcp: true\n";
    expect(setConfigValue(text, "progress", "tasks")).toBe(
      "# Featra project settings\nversion: 1\nhierarchy: epic-feature-story-task\nprogress: tasks # stories | tasks\nmcp: true\n",
    );
    expect(setConfigValue(text, "requireAccept", false)).toBe(
      "# Featra project settings\nversion: 1\nhierarchy: epic-feature-story-task\nprogress: stories # stories | tasks\nmcp: true\nrequireAccept: false\n",
    );
  });

  it("removing a key lets the app-wide default apply again", () => {
    const text = setConfigValue("version: 1\nprogress: tasks\nmcp: true\n", "progress", undefined);
    expect(text).toBe("version: 1\nmcp: true\n");
    expect(parseConfig(text, appDefaults).progress).toBe("tasks");
    expect(configOverrides(text)).not.toHaveProperty("progress");
  });

  it("starts a new file with the header when the project has none yet", () => {
    expect(setConfigValue("", "worktrees", false)).toBe("# Featra project settings\nversion: 1\nworktrees: false\n");
  });

  it("refuses to edit a file that isn't valid, or to write a value that isn't", () => {
    expect(() => setConfigValue("progress: [", "worktrees", false)).toThrow(ConfigError);
    expect(() => setConfigValue("progress: effort\n", "worktrees", false)).toThrow(ConfigError);
    expect(() => setConfigValue("", "knowledge", "everything" as never)).toThrow(ConfigError);
  });
});
