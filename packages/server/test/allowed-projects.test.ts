import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { createAllowedProjects } from "../src/allowed-projects.ts";

/** The project list the host sends, as the server keeps it. */
describe("the allowed projects' folders", () => {
  // Regression (STORY-67 review): a folder listed twice in two cases was two projects, so its waiting agents counted twice.
  it("lists a folder once where case doesn't matter, as the host first spelled it", () => {
    const allowed = createAllowedProjects("win32");
    allowed.set([resolve("/work/Site"), resolve("/work/site"), resolve("/work/docs")]);
    expect(allowed.dirs()).toEqual([resolve("/work/Site"), resolve("/work/docs")]);
  });

  it("keeps folders that differ in case apart where case matters", () => {
    const allowed = createAllowedProjects("linux");
    allowed.set(["/work/Site", "/work/site"]);
    expect(allowed.dirs()).toEqual(["/work/Site", "/work/site"]);
  });

  it("lists a folder sent twice once", () => {
    const allowed = createAllowedProjects("linux");
    allowed.set(["/work/site", "/work/site/"]);
    expect(allowed.dirs()).toEqual(["/work/site"]);
  });
});
