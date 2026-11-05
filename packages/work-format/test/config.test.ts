import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_CONFIG, isKnownStatus, parseConfig, serializeConfig, stageCategory } from "../src/index.ts";

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
