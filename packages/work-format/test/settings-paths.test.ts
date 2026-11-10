/** STORY-6 AC4, AC7: trust paths as Codex writes them, an agent's permissionMode, and a partial save's params. */
import { describe, expect, it } from "vitest";
import { modeLabel, modeWhere, normalizeMode } from "../src/modes.ts";
import {
  codexStartMode,
  parseClaudeAgent,
  parseRoleFile,
  roleEditParams,
  samePath,
  serializeRoleFile,
  withAncestors,
} from "../src/index.ts";

describe("trust paths", () => {
  it("read a long-path UNC share as the share it names, not as a folder called UNC", () => {
    expect(samePath(String.raw`\\?\UNC\srv\share\app`, String.raw`\\srv\share\app`)).toBe(true);
    expect(samePath(String.raw`\\?\UNC\SRV\Share\App`, "//srv/share/app")).toBe(true);
    expect(samePath(String.raw`\\?\UNC\srv\share\app`, "UNC/srv/share/app")).toBe(false);
    expect(samePath(String.raw`\\srv\share\app`, String.raw`\\srv\share\other`)).toBe(false);
  });

  it("list a folder and every folder above it, nearest first", () => {
    expect(withAncestors("C:\\dev\\app\\")).toEqual([String.raw`C:\dev\app`, String.raw`C:\dev`, "C:"]);
    expect(withAncestors("/home/me/app")).toEqual(["/home/me/app", "/home/me", "/home"]);
  });

  it("make a project trusted through a folder above it, or through the main checkout of its worktree", () => {
    const user = `[projects.'\\\\?\\c:\\dev']\ntrust_level = "trusted"\n`;
    const project = 'approval_policy = "never"\nsandbox_mode = "read-only"\n';
    const dir = String.raw`C:\dev\app\sub`;
    expect(codexStartMode({ user, project, dir }).mode).toMatchObject({ name: "never · read-only", level: "project" });
    const worktree = `[projects.'D:\\main']\ntrust_level = "trusted"\n`;
    expect(codexStartMode({ user: worktree, project, dir: String.raw`E:\wt` }).mode).toBeNull();
    expect(
      codexStartMode({ user: worktree, project, dir: String.raw`E:\wt`, roots: [String.raw`D:\main`] }).mode,
    ).toMatchObject({ level: "project" });
  });

  it("don't trust a sibling folder", () => {
    const user = `[projects.'C:\\dev\\other']\ntrust_level = "trusted"\n`;
    expect(codexStartMode({ user, project: 'approval_policy = "never"', dir: String.raw`C:\dev\app` }).mode).toBeNull();
  });
});

const file = (mode: string) => `---\nname: a\npermissionMode: ${mode}\n---\nGo.`;

describe("a Claude agent's permissionMode", () => {
  it("is the agent's own mode, from the agent", () => {
    expect(parseClaudeAgent(file("acceptEdits"), "a")).toMatchObject({
      ok: true,
      agent: { mode: { provider: "claude", name: "acceptEdits", level: "agent", fullAccess: false } },
    });
    expect(parseClaudeAgent(file("bypassPermissions"), "a")).toMatchObject({
      agent: { mode: { fullAccess: true } },
    });
  });

  it("is a problem, and no mode, when it isn't a Claude mode", () => {
    const read = parseClaudeAgent(file("yolo"), "a");
    expect(read).toMatchObject({ ok: true, agent: { modeProblem: expect.stringContaining("yolo") } });
    expect(read.ok && read.agent.mode).toBeUndefined();
  });

  it("is absent when the file names none", () => {
    expect(parseClaudeAgent("---\nname: a\n---\nGo.", "a")).toEqual({
      ok: true,
      agent: { name: "a", prompt: "Go.", effort: "medium" },
    });
  });
});

describe("a partial role file and save", () => {
  it("writes only the fields given, and a blank body is no prompt", () => {
    const text = serializeRoleFile({ model: "haiku" });
    expect(text).not.toMatch(/name|effort/);
    expect(parseRoleFile(text)).toEqual({ ok: true, fields: { model: "haiku" } });
  });

  it("is a save params with any of prompt, model and effort left out", () => {
    expect(roleEditParams({ dir: "/p", edit: { action: "save", id: "qa", prompt: "x" } })).toEqual({
      dir: "/p",
      edit: { action: "save", id: "qa", prompt: "x" },
    });
    expect(roleEditParams({ dir: "/p", edit: { action: "save", id: "qa", effort: "max" } })?.edit).toEqual({
      action: "save",
      id: "qa",
      effort: "max",
    });
    expect(roleEditParams({ dir: "/p", edit: { action: "save", id: "qa", effort: "huge" } })).toBeNull();
    expect(roleEditParams({ dir: "/p", edit: { action: "save", id: "qa", model: 3 } })).toBeNull();
  });
});

describe("where a mode came from, in words", () => {
  it("names the managed settings and the agent's own file, and both survive the socket", () => {
    const managed = { provider: "claude", name: "plan", level: "managed", fullAccess: false } as const;
    const agent = { ...managed, level: "agent" } as const;
    expect(modeLabel(managed)).toBe("plan · from Claude settings");
    expect(modeWhere(managed)).toBe("Set in Claude's managed settings");
    expect(modeLabel(agent)).toBe("plan · from the agent");
    expect(modeWhere(agent)).toBe("Set in the agent's own file");
    expect(normalizeMode(managed)).toEqual(managed);
    expect(normalizeMode(agent)).toEqual(agent);
  });
});
