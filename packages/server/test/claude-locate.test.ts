/** STORY-5 AC1: the user's own `claude`, found the way their shell would find it. The PATH lookup is faked. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { locateClaude, type Lookup } from "../src/claude-locate.ts";

const answers = (out: string | null) => {
  const asked: string[] = [];
  const lookup: Lookup = async (command, args) => {
    asked.push([command, ...args].join(" "));
    return out;
  };
  return { lookup, asked };
};

describe("AC1: locating the user's claude", () => {
  it("asks `which` outside Windows and takes the first path", async () => {
    const { lookup, asked } = answers("/home/me/.local/bin/claude\n/usr/bin/claude\n");
    expect(await locateClaude(lookup, "linux")).toBe("/home/me/.local/bin/claude");
    expect(asked).toEqual(["which claude"]);
  });

  it("asks `where` on Windows and prefers the native .exe", async () => {
    const { lookup, asked } = answers(
      "C:\\npm\\claude\r\nC:\\npm\\claude.cmd\r\nC:\\Users\\me\\.local\\bin\\claude.exe\r\n",
    );
    expect(await locateClaude(lookup, "win32", () => true)).toBe("C:\\Users\\me\\.local\\bin\\claude.exe");
    expect(asked).toEqual(["where claude"]);
  });

  it("follows an npm .cmd shim to the script the SDK can run", async () => {
    const { lookup } = answers("C:\\npm\\claude\r\nC:\\npm\\claude.cmd\r\n");
    const script = join("C:\\npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js");
    expect(await locateClaude(lookup, "win32", (p) => p === script)).toBe(script);
  });

  it("falls back to the first path when the shim's script isn't there", async () => {
    const { lookup } = answers("C:\\tools\\claude.bat\r\n");
    expect(await locateClaude(lookup, "win32", () => false)).toBe("C:\\tools\\claude.bat");
  });

  it("is null when the lookup finds nothing", async () => {
    expect(await locateClaude(answers(null).lookup, "linux")).toBeNull();
    expect(await locateClaude(answers("").lookup, "win32")).toBeNull();
  });
});
