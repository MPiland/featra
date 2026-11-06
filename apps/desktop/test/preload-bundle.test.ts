import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * A sandboxed preload can only `require("electron")`. Anything else makes it fail to load, the page silently falls
 * back to the browser bridge, and the window loses its controls and IPC. Builds the real preload with the real Vite
 * config and checks what the bundle requires.
 */
const desktop = join(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "featra-preload-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("the preload bundle", () => {
  it("requires nothing but electron", () => {
    execFileSync(
      process.execPath,
      [join(desktop, "node_modules", "vite", "bin", "vite.js"), "build", "--mode", "preload", "--outDir", out],
      { cwd: desktop, stdio: "pipe" },
    );
    const code = readFileSync(join(out, "preload.cjs"), "utf8");
    const required = [...new Set([...code.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]))];
    expect(required).toEqual(["electron"]);
  }, 60_000);
});
