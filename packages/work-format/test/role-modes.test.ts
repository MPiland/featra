/** STORY-6 AC7: the mode a chat starts in, read from the providers' own settings (pure parts). */
import { describe, expect, it } from "vitest";
import {
  claudeStartMode,
  codexStartMode,
  FULL_ACCESS_WARNING,
  modeLabel,
  modeWhere,
  normalizeMode,
  type SettingsLayer,
} from "../src/index.ts";

const layer = (level: SettingsLayer["level"], text: string | null): SettingsLayer => ({
  level,
  file: `${level}.json`,
  text,
});
const setting = (defaultMode: unknown) => JSON.stringify({ permissions: { defaultMode } });

describe("claudeStartMode (AC7)", () => {
  it("is no mode when no file names one, so the role starts in Ask", () => {
    expect(claudeStartMode([layer("local", null), layer("project", "{}"), layer("user", null)])).toEqual({
      mode: null,
      problems: [],
    });
  });

  it("takes Claude's own name and the file it came from", () => {
    const { mode } = claudeStartMode([layer("project", null), layer("user", setting("acceptEdits"))]);
    expect(mode).toEqual({ provider: "claude", name: "acceptEdits", level: "user", fullAccess: false });
  });

  it("lets the local file win over the project's, and that over the user's", () => {
    const all = [layer("local", setting("plan")), layer("project", setting("auto")), layer("user", setting("default"))];
    expect(claudeStartMode(all).mode?.name).toBe("plan");
    expect(claudeStartMode(all.slice(1)).mode).toMatchObject({ name: "auto", level: "project" });
    expect(claudeStartMode(all.slice(2)).mode).toMatchObject({ name: "default", level: "user" });
  });

  it("reads dontAsk as a Claude mode, labelled as the others are, and not full access", () => {
    const { mode } = claudeStartMode([layer("project", setting("dontAsk"))]);
    expect(mode).toEqual({ provider: "claude", name: "dontAsk", level: "project", fullAccess: false });
    expect(modeLabel(mode!)).toBe("dontAsk · from Claude settings");
  });

  it("marks only bypassPermissions as full access", () => {
    expect(claudeStartMode([layer("user", setting("bypassPermissions"))]).mode?.fullAccess).toBe(true);
    expect(claudeStartMode([layer("user", setting("auto"))]).mode?.fullAccess).toBe(false);
  });

  it("skips a malformed file or an unknown mode with a problem, and reads the next layer", () => {
    const read = claudeStartMode([
      layer("local", "{ nope"),
      layer("project", setting("yolo")),
      layer("user", setting("plan")),
    ]);
    expect(read.mode?.name).toBe("plan");
    expect(read.problems).toHaveLength(2);
    expect(read.problems[0]).toContain("local.json");
    expect(read.problems[1]).toContain("project.json");
  });

  it("ignores settings of the wrong shape", () => {
    for (const text of ["[]", "null", '{"permissions":"x"}', '{"permissions":{"defaultMode":null}}'])
      expect(claudeStartMode([layer("user", text)]).mode).toBeNull();
  });
});

const DIR = "C:\\dev\\app";
const trust = `[projects.'C:\\dev\\app']\ntrust_level = "trusted"\n`;

describe("codexStartMode (AC7)", () => {
  it("is no mode with no settings and no trust entry", () => {
    expect(codexStartMode({ user: null, project: null, dir: DIR })).toEqual({ mode: null, problems: [] });
  });

  it("reads the user's approval_policy and sandbox_mode in Codex's own names", () => {
    const user = 'approval_policy = "untrusted"\nsandbox_mode = "read-only"\n';
    expect(codexStartMode({ user, project: null, dir: DIR }).mode).toEqual({
      provider: "codex",
      name: "untrusted · read-only",
      level: "user",
      fullAccess: false,
    });
  });

  it("lets a trusted project's own config win, and ignores it when the project isn't trusted", () => {
    const project = 'approval_policy = "on-failure"\n';
    const user = `approval_policy = "never"\nsandbox_mode = "workspace-write"\n${trust}`;
    expect(codexStartMode({ user, project, dir: DIR }).mode).toMatchObject({
      name: "on-failure · workspace-write",
      level: "project",
    });
    const untrusted = 'approval_policy = "never"\nsandbox_mode = "workspace-write"\n';
    expect(codexStartMode({ user: untrusted, project, dir: DIR }).mode?.name).toBe("never · workspace-write");
  });

  it("matches the trust entry whatever the path's separators and drive letter case", () => {
    const user = `[projects."c:/dev/app/"]\ntrust_level = "trusted"\n`;
    expect(codexStartMode({ user, project: null, dir: DIR }).mode).toMatchObject({
      name: "on-request · workspace-write",
    });
  });

  it("matches a trust entry Codex wrote as a literal key with the Windows long-path prefix", () => {
    const user = `[projects.'\\\\?\\c:\\dev\\app']\ntrust_level = "trusted"\n`;
    expect(codexStartMode({ user, project: null, dir: DIR }).mode).toMatchObject({
      name: "on-request · workspace-write",
    });
  });

  it("honours full access: never with danger-full-access", () => {
    const user = 'approval_policy = "never"\nsandbox_mode = "danger-full-access"\n';
    expect(codexStartMode({ user, project: null, dir: DIR }).mode?.fullAccess).toBe(true);
  });

  it("reports a malformed config and carries on without it", () => {
    const read = codexStartMode({ user: "approval_policy = ", project: null, dir: DIR });
    expect(read.mode).toBeNull();
    expect(read.problems[0]).toContain("config.toml");
  });
});

describe("how a mode reads in the UI (AC7)", () => {
  it("shows the provider's own name and where it came from", () => {
    const mode = { provider: "claude", name: "auto", level: "user", fullAccess: false } as const;
    expect(modeLabel(mode)).toBe("auto · from Claude settings");
    expect(modeWhere({ ...mode, level: "local" })).toBe("Set in Claude's local project settings");
    expect(modeLabel({ provider: "claude", name: "Ask", level: null, fullAccess: false })).toBe("Ask");
    expect(FULL_ACCESS_WARNING).toMatch(/without asking/);
  });

  it("reads a mode back from the socket, or null", () => {
    const mode = { provider: "codex", name: "never", level: "project", fullAccess: true };
    expect(normalizeMode(mode)).toEqual(mode);
    for (const bad of [null, "x", { ...mode, provider: "gemini" }, { ...mode, level: "team" }, { ...mode, name: "" }])
      expect(normalizeMode(bad)).toBeNull();
  });
});
