/**
 * STORY-5 AC1, on any host: finding a Windows `claude` follows the npm shim the same way when the server's own path
 * module is POSIX (a regression: CI on Linux joined the Windows path with `/`). The host's path module is faked.
 */
import type * as Path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { locateClaude } from "../src/claude-locate.ts";

vi.mock("node:path", async (original) => {
  const { posix } = await original<typeof Path>();
  return { ...posix, default: posix };
});

const npmLookup = async () => "C:\\npm\\claude\r\nC:\\npm\\claude.cmd\r\n";

describe("AC1: locating claude reads Windows paths as Windows paths on every host", () => {
  it("follows an npm .cmd shim to its script on a POSIX host", async () => {
    const script = "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js";
    expect(await locateClaude(npmLookup, "win32", (p) => p === script)).toBe(script);
  });
});
