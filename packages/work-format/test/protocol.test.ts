import { describe, expect, it } from "vitest";
import {
  AGENT_INSTRUCTION_FILES,
  FEATRA_SCAFFOLD,
  NEW_CONFIG,
  dirParams,
  isAgentInstructionFile,
  normalizeInitResult,
  normalizeProjectSetup,
  parseRequest,
  parseResponse,
} from "../src/index.ts";

describe("STORY-2 AC2: what Featra init scaffolds", () => {
  it("is the config, CONTEXT.md, docs/adr/, decisions.md and open-questions.md", () => {
    expect(FEATRA_SCAFFOLD.map((e) => `${e.path}${e.kind === "folder" ? "/" : ""}`)).toEqual([
      ".featra/config.yaml",
      "CONTEXT.md",
      "docs/adr/",
      "decisions.md",
      "open-questions.md",
    ]);
  });

  it("writes a config that holds only the version", () => {
    expect(FEATRA_SCAFFOLD[0]).toEqual({ kind: "file", path: ".featra/config.yaml", content: NEW_CONFIG });
    expect(NEW_CONFIG.split("\n").filter((l) => l && !l.startsWith("#"))).toEqual(["version: 1"]);
  });
});

describe("STORY-2 AC3: init never touches CLAUDE.md or AGENTS.md", () => {
  it("has no agent instruction file among its paths or seeds", () => {
    const paths = FEATRA_SCAFFOLD.flatMap((e) =>
      e.kind === "file" ? [e.path] : [e.path].concat(e.seed.map((s) => `${e.path}/${s.name}`)),
    );
    expect(paths.filter(isAgentInstructionFile)).toEqual([]);
  });

  it("recognises them in any folder and any case, and nothing else", () => {
    expect(AGENT_INSTRUCTION_FILES).toEqual(["CLAUDE.md", "AGENTS.md"]);
    for (const path of ["CLAUDE.md", "agents.md", "docs/Claude.MD", "a/b/AGENTS.md"]) {
      expect(isAgentInstructionFile(path), path).toBe(true);
    }
    for (const path of ["CLAUDE.md.bak", "MY-CLAUDE.md", "CLAUDE", "claude.md/notes.md", ""]) {
      expect(isAgentInstructionFile(path), path).toBe(false);
    }
  });
});

describe("the server protocol (ADR 0015)", () => {
  it("reads a request for a known method", () => {
    expect(parseRequest('{"id":3,"method":"project.init","params":{"dir":"/p"}}')).toEqual({
      id: 3,
      method: "project.init",
      params: { dir: "/p" },
    });
  });

  it("answers an unknown method by id, and a frame without a usable id with null", () => {
    expect(parseRequest('{"id":4,"method":"project.delete"}')).toEqual({ id: 4, error: "Unknown method." });
    expect(parseRequest('{"id":4,"method":"toString"}')).toEqual({ id: 4, error: "Unknown method." });
    for (const text of ["not json", "[]", "null", '{"method":"project.init"}', '{"id":"1"}', '{"id":1.5}']) {
      expect(parseRequest(text), text).toEqual({ id: null, error: "Malformed request." });
    }
  });

  it("reads responses; a failure without a message still says something", () => {
    expect(parseResponse('{"id":1,"ok":true,"result":{"state":"ready"}}')).toEqual({
      id: 1,
      ok: true,
      result: { state: "ready" },
    });
    expect(parseResponse('{"id":2,"ok":false,"error":"Nope."}')).toEqual({ id: 2, ok: false, error: "Nope." });
    expect(parseResponse('{"id":2,"ok":false}')).toEqual({ id: 2, ok: false, error: "Request failed." });
    expect(parseResponse("garbage")).toBeNull();
    expect(parseResponse('{"ok":true}')).toBeNull();
  });

  it("takes { dir } params only with a non-empty string", () => {
    expect(dirParams({ dir: "/p", extra: 1 })).toEqual({ dir: "/p" });
    for (const params of [undefined, null, {}, { dir: "" }, { dir: 1 }, "/p"]) {
      expect(dirParams(params), JSON.stringify(params)).toBeNull();
    }
  });

  it("normalizes a setup status, turning anything unknown into an error", () => {
    for (const state of ["no-git", "no-featra", "ready"] as const) {
      expect(normalizeProjectSetup({ state, extra: true })).toEqual({ state });
    }
    expect(normalizeProjectSetup({ state: "error", error: "Folder not found: /p" })).toEqual({
      state: "error",
      error: "Folder not found: /p",
    });
    expect(normalizeProjectSetup({ state: "weird" })).toEqual({ state: "error", error: "Something went wrong." });
    expect(normalizeProjectSetup(null)).toEqual({ state: "error", error: "Something went wrong." });
  });

  it("normalizes an init result, keeping only string paths", () => {
    expect(normalizeInitResult({ ok: true, created: ["CONTEXT.md", 3], kept: "x" })).toEqual({
      ok: true,
      created: ["CONTEXT.md"],
      kept: [],
    });
    expect(normalizeInitResult({ ok: false, error: "Can't initialize Featra: busy" })).toEqual({
      ok: false,
      error: "Can't initialize Featra: busy",
    });
    expect(normalizeInitResult(undefined)).toEqual({ ok: false, error: "Something went wrong." });
  });
});
