import { DEFAULT_CONFIG } from "@featra/work-format";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_SETTINGS } from "../src/settings.ts";

describe("the app's defaults for work settings", () => {
  it("are the project's own defaults, so a project without the key behaves as the app shows", () => {
    for (const key of Object.keys(DEFAULT_WORK_SETTINGS) as (keyof typeof DEFAULT_WORK_SETTINGS)[]) {
      expect(DEFAULT_WORK_SETTINGS[key]).toEqual(DEFAULT_CONFIG[key]);
    }
  });
});
