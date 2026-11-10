/** STORY-6 AC2, AC3, AC4, AC5: role files, provider agent files, names, ids and the model Claude can run. */
import { describe, expect, it } from "vitest";
import {
  fitModel,
  joinFrontmatter,
  nameProblem,
  newRoleId,
  normalizeRoleList,
  parseClaudeAgent,
  parseCodexAgent,
  parseRoleFile,
  roleEditParams,
  roleIdOf,
  serializeRoleFile,
  sourceTag,
  splitFrontmatter,
  uniqueName,
} from "../src/index.ts";

describe("role files (AC2, AC3)", () => {
  it("round-trips a role through its file", () => {
    const fields = { name: "Reviewer", model: "opus", effort: "high", prompt: "Review it.\n\nTwice." } as const;
    expect(parseRoleFile(serializeRoleFile(fields))).toEqual({ ok: true, fields });
  });

  it("keeps a prompt that looks like frontmatter", () => {
    const prompt = "---\nnot: frontmatter\n---\nstill the prompt";
    const read = parseRoleFile(serializeRoleFile({ name: "A", model: "sonnet", effort: "low", prompt }));
    expect(read).toMatchObject({ ok: true, fields: { prompt } });
  });

  it("reads missing fields as missing, so a built-in override keeps the built-in's", () => {
    expect(parseRoleFile("---\nmodel: haiku\n---\nBody")).toEqual({
      ok: true,
      fields: { model: "haiku", prompt: "Body" },
    });
    expect(parseRoleFile("Just a prompt")).toEqual({ ok: true, fields: { prompt: "Just a prompt" } });
  });

  it("refuses a malformed file, an empty name or model and an unknown effort", () => {
    for (const text of [
      "---\n: : x\n  - [\n---\nbody",
      "---\nname: ''\n---\n",
      "---\nmodel: 3\n---\n",
      "---\neffort: huge\n---\n",
    ])
      expect(parseRoleFile(text).ok).toBe(false);
  });

  it("names only .md files with a plain id as role files", () => {
    expect(roleIdOf("qa.md")).toBe("qa");
    for (const name of ["qa.txt", ".md", "a b.md", "../x.md", "qa"]) expect(roleIdOf(name)).toBeNull();
  });
});

describe("names and ids (AC3)", () => {
  it("refuses a blank, long or taken name, whatever its case", () => {
    expect(nameProblem("  ", [])).toMatch(/name/);
    expect(nameProblem("x".repeat(61), [])).toMatch(/60/);
    expect(nameProblem("qa", ["QA"])).toMatch(/already exists/);
    expect(nameProblem(" Fresh ", ["QA"])).toBeNull();
  });

  it("makes a name unique with a number", () => {
    expect(uniqueName("QA", ["QA", "QA 2"])).toBe("QA 3");
    expect(uniqueName("Free", ["QA"])).toBe("Free");
  });

  it("makes an id from the words, unique among the taken", () => {
    expect(newRoleId("Code Reviewer!", new Set())).toBe("code-reviewer");
    expect(newRoleId("QA", new Set(["qa", "qa-2"]))).toBe("qa-3");
    expect(newRoleId("???", new Set())).toBe("role");
  });
});

describe("frontmatter", () => {
  it("handles CRLF files, a BOM and a file with no body", () => {
    expect(splitFrontmatter("﻿---\r\nname: x\r\n---\r\nBody\r\n")).toEqual({
      data: { name: "x" },
      body: "Body",
      has: true,
    });
    expect(splitFrontmatter("---\nname: x\n---")).toMatchObject({ data: { name: "x" }, body: "" });
    expect(joinFrontmatter({ a: 1 }, " body ")).toBe("---\na: 1\n---\n\nbody\n");
  });

  it("refuses frontmatter that is not a mapping", () => {
    expect(splitFrontmatter("---\n- a\n---\nx")).toHaveProperty("error");
  });
});

describe("provider agent files (AC4)", () => {
  it("reads a Claude agent: frontmatter and the prompt as the body", () => {
    const text = "---\nname: reviewer\ndescription: Reviews code\nmodel: opus\neffort: high\n---\nYou review.";
    expect(parseClaudeAgent(text, "file")).toEqual({
      ok: true,
      agent: { name: "reviewer", description: "Reviews code", prompt: "You review.", model: "opus", effort: "high" },
    });
  });

  it("names a Claude agent for its file when it has no name, and defaults the effort", () => {
    expect(parseClaudeAgent("---\ndescription: d\n---\nP", "helper")).toMatchObject({
      ok: true,
      agent: { name: "helper", effort: "medium" },
    });
  });

  it("refuses a Claude agent file with no or broken frontmatter", () => {
    expect(parseClaudeAgent("Just text", "x")).toEqual({ ok: false, error: "no frontmatter" });
    expect(parseClaudeAgent("---\n: [\n---\nx", "x").ok).toBe(false);
  });

  it("reads a Codex agent as Codex writes it: a multi-line prompt, a sandbox and nicknames Featra ignores", () => {
    const toml = [
      'name = "checker"',
      'description = "Checks the work"',
      'sandbox_mode = "read-only"',
      'nickname_candidates = ["Ada", "Lin"]',
      'developer_instructions = """',
      "Check the work.",
      "Report what you find.",
      '"""',
    ].join("\n");
    expect(parseCodexAgent(toml, "file")).toMatchObject({
      ok: true,
      agent: { name: "checker", description: "Checks the work", prompt: "Check the work.\nReport what you find." },
    });
  });

  it("reads a Codex agent: developer_instructions as the prompt, reasoning effort in Featra's words", () => {
    const toml =
      'name = "scout"\nmodel = "gpt-5"\nmodel_reasoning_effort = "minimal"\ndeveloper_instructions = "Look around."\n';
    expect(parseCodexAgent(toml, "file")).toEqual({
      ok: true,
      agent: { name: "scout", prompt: "Look around.", model: "gpt-5", effort: "low" },
    });
    expect(parseCodexAgent('model_reasoning_effort = "xhigh"', "s")).toMatchObject({
      ok: true,
      agent: { name: "s", effort: "xhigh", prompt: "" },
    });
  });

  it("refuses a malformed Codex agent file", () => {
    expect(parseCodexAgent("name = ", "x").ok).toBe(false);
  });
});

describe("the model Claude can run (AC5)", () => {
  it("keeps Claude's aliases and full ids", () => {
    for (const m of ["sonnet", "Opus", "haiku", "sonnet[1m]", "claude-opus-4-1", "opusplan"])
      expect(fitModel(m)).toEqual({ model: m, note: null });
  });

  it("starts a missing model or Claude's own inherit on its default, with no note", () => {
    for (const m of [undefined, "", "  ", "inherit", "default"])
      expect(fitModel(m)).toEqual({ model: "default", note: null });
  });

  it("falls back to Claude's default for a model it doesn't have, with one line saying so", () => {
    const { model, note } = fitModel("gpt-5-codex");
    expect(model).toBe("default");
    expect(note).toBe("Claude doesn't have the model \"gpt-5-codex\": using Claude's default.");
    expect(note).not.toContain("\n");
  });
});

describe("roles on the socket (AC1)", () => {
  it("tags each role with where it came from", () => {
    expect(sourceTag({ kind: "built-in", edited: false })).toBe("Built-in");
    expect(sourceTag({ kind: "built-in", edited: true })).toBe("Built-in · edited");
    expect(sourceTag({ kind: "custom" })).toBe("Custom");
    expect(sourceTag({ kind: "provider", provider: "claude", scope: "user" })).toBe("Claude · user");
    expect(sourceTag({ kind: "provider", provider: "codex", scope: "project" })).toBe("Codex · project");
  });

  it("reads an edit's params, and nothing malformed", () => {
    expect(roleEditParams({ dir: "/p", edit: { action: "rename", id: "a", name: "B" } })).toEqual({
      dir: "/p",
      edit: { action: "rename", id: "a", name: "B" },
    });
    expect(roleEditParams({ dir: "/p", edit: { action: "reset", id: "qa" } })?.edit).toEqual({
      action: "reset",
      id: "qa",
    });
    for (const bad of [
      null,
      { dir: "/p" },
      { dir: "/p", edit: { action: "nuke", id: "a" } },
      { dir: "/p", edit: { action: "save", id: "a", prompt: "", model: "m", effort: "huge" } },
      { dir: "", edit: { action: "create", name: "x" } },
    ])
      expect(roleEditParams(bad)).toBeNull();
  });

  it("reads a list back, dropping what is not a role", () => {
    expect(normalizeRoleList({ roles: [{ nope: 1 }], problems: ["x", 3] })).toEqual({ roles: [], problems: ["x"] });
    expect(normalizeRoleList("x")).toEqual({ roles: [], problems: [] });
  });
});
