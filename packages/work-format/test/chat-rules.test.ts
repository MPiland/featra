/** STORY-45: Featra's own Allow for this chat rule, used when the provider suggests none (decided 2026-11-09). */
import { describe, expect, it } from "vitest";
import { chatRule, insideFolder } from "../src/index.ts";

const BASH = { command: "npm test" };
const CWD = "/home/u/demo";
const WIN = String.raw`C:\Users\u\demo`;
const key = (name: string, input: unknown, cwd = CWD) => chatRule(name, input, cwd)?.key ?? null;
const fetch = (url: string) => key("WebFetch", { url, prompt: "x" });

describe("shell tools: the exact command, run the same way", () => {
  it("keys Bash and PowerShell by command and tool", () => {
    expect(key("Bash", { command: "npm test", description: "x" })).toBe(key("Bash", BASH));
    expect(key("Bash", { command: "rm -rf ." })).not.toBe(key("Bash", BASH));
    expect(key("PowerShell", BASH)).not.toBe(key("Bash", BASH));
    expect(chatRule("Bash", BASH, CWD)?.covers).toBe("This command: npm test");
  });

  it("keys on every field that changes how it runs, known or not", () => {
    const same = { ...BASH, description: "Run tests", timeout: 60_000, run_in_background: true };
    expect(key("Bash", same)).toBe(key("Bash", BASH));
    expect(key("Bash", { ...BASH, dangerouslyDisableSandbox: true })).not.toBe(key("Bash", BASH));
    expect(key("Bash", { ...BASH, later: "x" })).not.toBe(key("Bash", BASH));
    expect(key("Bash", { a: 1, ...BASH })).toBe(key("Bash", { ...BASH, a: 1 }));
  });

  it("has no rule for a call with no command", () => {
    expect(chatRule("Bash", {}, CWD)).toBeNull();
    expect(chatRule("Bash", { command: "" }, CWD)).toBeNull();
  });
});

describe("Write and Edit: only paths inside the chat's working folder, outside .git and .claude", () => {
  it("covers a path inside the folder, absolute or relative, with one rule per tool", () => {
    expect(key("Edit", { file_path: `${CWD}/src/a.ts` })).toBe(key("Edit", { file_path: "README.md" }));
    expect(key("Write", { file_path: `${CWD}/a.ts` })).not.toBe(key("Edit", { file_path: `${CWD}/a.ts` }));
    expect(chatRule("Edit", { file_path: `${CWD}/a.ts` }, CWD)?.covers).toBe("Edits in this folder");
    expect(chatRule("Write", { file_path: `${CWD}/a.ts` }, CWD)?.covers).toBe("Writes in this folder");
  });

  it("has no rule outside the folder", () => {
    expect(chatRule("Edit", { file_path: "/home/u/other/a.ts" }, CWD)).toBeNull();
    expect(chatRule("Edit", { file_path: "/home/u/demo-two/a.ts" }, CWD)).toBeNull();
    expect(chatRule("Edit", { file_path: CWD }, CWD)).toBeNull();
    expect(chatRule("Edit", { file_path: "~/.bashrc" }, CWD)).toBeNull();
    expect(chatRule("Edit", {}, CWD)).toBeNull();
  });

  it("has no rule inside .git or .claude, at any depth or case", () => {
    expect(insideFolder(`${CWD}/.git/config`, CWD)).toBe(false);
    expect(insideFolder(`${CWD}/.claude/settings.json`, CWD)).toBe(false);
    expect(insideFolder(`${CWD}/sub/.git/hooks/pre-commit`, CWD)).toBe(false);
    expect(insideFolder(String.raw`${WIN}\.GIT\config`, WIN)).toBe(false);
    expect(insideFolder(`${CWD}/.github/ci.yml`, CWD)).toBe(true);
  });

  it("resolves .. before deciding, so traversal out of the folder or into a guarded one has no rule", () => {
    expect(insideFolder(`${CWD}/src/../../other/a.ts`, CWD)).toBe(false);
    expect(insideFolder("../demo-two/a.ts", CWD)).toBe(false);
    expect(insideFolder(`${CWD}/src/../.git/config`, CWD)).toBe(false);
    expect(insideFolder(`${CWD}/src/../lib/a.ts`, CWD)).toBe(true);
    expect(insideFolder("/../../a.ts", "/")).toBe(false);
  });

  it("compares Windows paths without case, with either slash", () => {
    expect(insideFolder("c:/users/U/Demo/src/a.ts", WIN)).toBe(true);
    expect(insideFolder(String.raw`D:\Users\u\demo\a.ts`, WIN)).toBe(false);
    expect(insideFolder("C:a.ts", WIN)).toBe(false);
  });
});

/** A fake disk: `${CWD}/out` links to /elsewhere, `${CWD}/g` to the folder's .git, and /home/link to the folder. */
const real = (p: string): string | null => {
  if (p.includes("missing")) return null;
  return p.replace(`${CWD}/out`, "/elsewhere").replace(`${CWD}/g/`, `${CWD}/.git/`).replace("/home/link", CWD);
};

describe("Write and Edit with a real path resolver: links decide", () => {
  it("covers a path whose real path is inside the folder's real path", () => {
    expect(insideFolder(`${CWD}/src/a.ts`, CWD, real)).toBe(true);
    expect(insideFolder("src/a.ts", CWD, real)).toBe(true);
    expect(insideFolder(`${CWD}/src/a.ts`, "/home/link", real)).toBe(true);
    expect(chatRule("Write", { file_path: `${CWD}/a.ts` }, CWD, real)?.covers).toBe("Writes in this folder");
  });

  it("has no rule when the real path is outside, guarded, or can't be found", () => {
    expect(insideFolder(`${CWD}/out/a.ts`, CWD, real)).toBe(false);
    expect(insideFolder(`${CWD}/g/config`, CWD, real)).toBe(false);
    expect(insideFolder(`${CWD}/missing/a.ts`, CWD, real)).toBe(false);
    expect(chatRule("Edit", { file_path: `${CWD}/out/a.ts` }, CWD, real)).toBeNull();
  });

  it("has no rule for a path that names a guarded folder or has .., whatever it resolves to", () => {
    expect(insideFolder(`${CWD}/.claude/settings.json`, CWD, (p) => p.replace("/.claude", "/conf"))).toBe(false);
    expect(insideFolder(`${CWD}/src/../a.ts`, CWD, real)).toBe(false);
    expect(insideFolder("~/a.ts", CWD, real)).toBe(false);
  });
});

describe("WebFetch: per domain", () => {
  it("keys by the URL's host, and has no rule for a URL it can't read", () => {
    expect(fetch("https://example.com/a")).toBe(fetch("http://EXAMPLE.com/b?c"));
    expect(fetch("https://example.com/a")).not.toBe(fetch("https://example.org/a"));
    expect(fetch("https://docs.example.com/a")).not.toBe(fetch("https://example.com/a"));
    expect(chatRule("WebFetch", { url: "https://example.com/a" }, CWD)?.covers).toBe("Fetches from example.com");
    expect(chatRule("WebFetch", { url: "not a url" }, CWD)).toBeNull();
    expect(chatRule("WebFetch", { url: "file:///etc/passwd" }, CWD)).toBeNull();
  });
});

describe("MCP tools: per tool; any other tool: no rule", () => {
  it("keys an MCP tool by its name", () => {
    expect(key("mcp__gh__create_issue", { a: 1 })).toBe(key("mcp__gh__create_issue", { b: 2 }));
    expect(key("mcp__gh__create_issue", {})).not.toBe(key("mcp__gh__close_issue", {}));
    expect(chatRule("mcp__gh__create_issue", {}, CWD)?.covers).toBe("Every mcp__gh__create_issue call");
  });

  it("has no rule for a tool it doesn't know, so it is always asked about", () => {
    expect(chatRule("NotebookEdit", { notebook_path: `${CWD}/a.ipynb` }, CWD)).toBeNull();
    expect(chatRule("Task", {}, CWD)).toBeNull();
  });
});
