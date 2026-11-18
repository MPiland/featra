import { describe, expect, it } from "vitest";
import { SOAK_RUNNERS, soakFromBranch, soakFromInputs } from "../ci/soak-plan.ts";
import { workflow, workflowJob } from "./run.ts";

describe("soak plan", () => {
  it("reads platform, specs and run count from a soak/** branch name", () => {
    expect(soakFromBranch("soak/windows/tray/150")).toEqual({
      suite: "e2e",
      platform: "windows",
      specs: ["tray.spec.ts"],
      runs: 150,
    });
    expect(soakFromBranch("soak/ubuntu/tray+menu/20")).toEqual({
      suite: "e2e",
      platform: "ubuntu",
      specs: ["tray.spec.ts", "menu.spec.ts"],
      runs: 20,
    });
  });

  it("runs the whole suite when the branch names `all`", () => {
    expect(soakFromBranch("soak/ubuntu/all/5")).toEqual({ suite: "e2e", platform: "ubuntu", specs: [], runs: 5 });
  });

  it("repeats the whole unit suite when the branch names `unit` (BUG-6)", () => {
    expect(soakFromBranch("soak/windows/unit/50")).toEqual({ suite: "unit", platform: "windows", specs: [], runs: 50 });
  });

  it("soaks on macOS, on the Apple silicon runner the macOS e2e job uses (STORY-63)", () => {
    expect(soakFromBranch("soak/macos/tray/5")).toEqual({
      suite: "e2e",
      platform: "macos",
      specs: ["tray.spec.ts"],
      runs: 5,
    });
    expect(soakFromInputs("", "macos", "20", "unit")).toEqual({
      suite: "unit",
      platform: "macos",
      specs: [],
      runs: 20,
    });
    const soak = workflow("soak.yml");
    expect(soak).toMatch(/^ {8}options: \[windows, ubuntu, macos\]$/m);
    expect(soak).toMatch(/^ {6}runner: \$\{\{ steps\.plan\.outputs\.runner \}\}$/m);
    expect(workflowJob("soak.yml", "soak")).toMatch(/^ {4}runs-on: \$\{\{ needs\.plan\.outputs\.runner \}\}$/m);
    for (const [platform, runner] of Object.entries(SOAK_RUNNERS)) {
      expect(workflowJob("ci.yml", `e2e-${platform}`), platform).toMatch(
        new RegExp(String.raw`^ {4}runs-on: ${runner}$`, "m"),
      );
    }
  });

  it("rejects branch names that don't follow soak/<platform>/<specs>/<runs>", () => {
    expect(() => soakFromBranch("soak/windows/tray")).toThrow(/soak\/<platform>\/<specs>\/<runs>/);
    expect(() => soakFromBranch("feature/windows/tray/5")).toThrow(/soak\/<platform>/);
    expect(() => soakFromBranch("soak/freebsd/tray/5")).toThrow(/windows, ubuntu or macos/);
    expect(() => soakFromBranch("soak/windows/tray/0")).toThrow(/positive whole number/);
    expect(() => soakFromBranch("soak/windows/tray/ten")).toThrow(/positive whole number/);
    expect(() => soakFromBranch("soak/windows/$(id)/5")).toThrow(/spec names/);
  });

  it("reads the Actions tab's inputs, with an empty spec meaning the whole suite", () => {
    expect(soakFromInputs("tray.spec.ts  menu.spec.ts", "windows", "150")).toEqual({
      suite: "e2e",
      platform: "windows",
      specs: ["tray.spec.ts", "menu.spec.ts"],
      runs: 150,
    });
    expect(soakFromInputs("", "ubuntu", "20")).toEqual({ suite: "e2e", platform: "ubuntu", specs: [], runs: 20 });
    expect(() => soakFromInputs("tray.spec.ts;rm", "ubuntu", "20")).toThrow(/spec names/);
  });

  it("reads the unit suite from the Actions tab, which takes no specs", () => {
    expect(soakFromInputs("", "windows", "50", "unit")).toEqual({
      suite: "unit",
      platform: "windows",
      specs: [],
      runs: 50,
    });
    expect(() => soakFromInputs("tray.spec.ts", "windows", "50", "unit")).toThrow(/unit suite takes no specs/);
    expect(() => soakFromInputs("", "windows", "50", "lint")).toThrow(/suite must be e2e or unit/);
  });
});
