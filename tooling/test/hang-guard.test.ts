import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_HANG_GUARD_MS,
  HANG_GUARD,
  HANG_GUARD_ENV,
  hangGuard,
  hangGuardMs,
  WAIT_REPORT_SETUP,
} from "../hang-guard.ts";
import { REPO } from "./run.ts";

describe("the hang guard (BUG-28)", () => {
  it("is 120 s unless the environment sets it, and refuses a value that isn't a time", () => {
    expect(hangGuardMs({})).toBe(DEFAULT_HANG_GUARD_MS);
    expect(DEFAULT_HANG_GUARD_MS).toBe(120_000);
    expect(hangGuardMs({ [HANG_GUARD_ENV]: "900000" })).toBe(900_000);
    for (const bad of ["15m", "0", "-5", "1.5"]) expect(() => hangGuardMs({ [HANG_GUARD_ENV]: bad })).toThrow(bad);
  });

  it("limits every test, hook and poll, and gives test code the same limit", () => {
    expect(hangGuard(300_000)).toEqual({
      testTimeout: 300_000,
      hookTimeout: 300_000,
      expect: { poll: { timeout: 300_000 } },
      provide: { hangGuardMs: 300_000 },
    });
  });

  it("is in every test project's config, since vitest passes it on to none", () => {
    const root = readFileSync(join(REPO, "vitest.config.ts"), "utf8");
    const projects = [...(/projects:\s*\[([^\]]*)\]/.exec(root)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(projects.length).toBeGreaterThan(5);
    const unguarded = projects.filter((dir) => {
      const config = ["vitest.config.ts", "vite.config.ts"].map((f) => join(REPO, dir, f)).find((f) => existsSync(f));
      return !config || !/\.\.\.HANG_GUARD\b/.test(readFileSync(config, "utf8"));
    });
    expect(unguarded).toEqual([]);
  });

  it("gives every project the setup file that names what a stopped test was waiting for (BUG-30)", () => {
    expect(HANG_GUARD.setupFiles).toEqual([WAIT_REPORT_SETUP]);
    expect(existsSync(WAIT_REPORT_SETUP)).toBe(true);
    const root = readFileSync(join(REPO, "vitest.config.ts"), "utf8");
    const projects = [...(/projects:\s*\[([^\]]*)\]/.exec(root)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    const dropped = projects.filter((dir) => {
      const config = ["vitest.config.ts", "vite.config.ts"].map((f) => join(REPO, dir, f)).find((f) => existsSync(f));
      const text = config ? readFileSync(config, "utf8") : "";
      return /setupFiles\s*:/.test(text) && !/setupFiles\s*:\s*\[\s*\.\.\.HANG_GUARD\.setupFiles\b/.test(text);
    });
    expect(projects.length).toBeGreaterThan(5);
    expect(dropped).toEqual([]);
  });

  it("is 300 s in CI, well inside the Gate job's own limit, so a hang fails a named test", () => {
    const ci = readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8");
    const gate = /\n {2}gate:\n([\s\S]*?)\n {2}\S/.exec(ci)?.[1] ?? "";
    const jobMinutes = Number(/timeout-minutes:\s*(\d+)/.exec(gate)?.[1]);
    const guardMs = Number(new RegExp(`${HANG_GUARD_ENV}:\\s*"(\\d+)"`).exec(gate)?.[1]);
    expect(guardMs).toBe(300_000);
    expect(jobMinutes * 60_000).toBeGreaterThanOrEqual(4 * guardMs);
  });
});
