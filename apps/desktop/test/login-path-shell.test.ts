import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLoginPath } from "../src/login-path.ts";

/**
 * STORY-64: the login shell's PATH read from real shells whose profiles misbehave. An interactive shell ignores SIGTERM,
 * and a background job a profile starts holds the shell's output open, so neither may hold up the app's start.
 */
const STARTED = "/usr/bin:/bin:/usr/sbin:/sbin";

/** Reads the PATH with a real `/bin/sh` whose `.profile` is `profile`, timing it. */
async function readWithProfile(profile: string, timeoutMs: number) {
  const home = await mkdtemp(join(tmpdir(), "featra-login-home-"));
  try {
    await writeFile(join(home, ".profile"), profile);
    const started = Date.now();
    const found = await readLoginPath({
      platform: "linux",
      env: { PATH: STARTED, SHELL: "/bin/sh", HOME: home, ENV: "" },
      home,
      timeoutMs,
    });
    return { found, took: Date.now() - started, home };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

describe.skipIf(!existsSync("/bin/sh"))("the login shell's PATH from a misbehaving profile (STORY-64)", () => {
  it("falls back at the time limit when the profile never finishes, though the shell ignores SIGTERM", async () => {
    const { found, took } = await readWithProfile("sleep 30\n", 300);
    expect(found.source).toBe("fallback");
    expect(took).toBeLessThan(2000);
  });

  it("reads the PATH without waiting for a background job the profile leaves running", async () => {
    const { found, took, home } = await readWithProfile('PATH="$HOME/tools/bin:$PATH"\nsleep 30 &\n', 3000);
    expect(found.source).toBe("login shell");
    expect(found.path.split(":")[0]).toBe(join(home, "tools", "bin"));
    expect(took).toBeLessThan(2500);
  });
});
