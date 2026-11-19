import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLoginPath } from "../src/login-path.ts";

/**
 * STORY-64: the login shell's PATH read from real shells. Each shell the user may log in with reads its own startup
 * file and answers the same command; and a profile that misbehaves may not hold up the app's start. An interactive
 * shell ignores SIGTERM, and a background job a profile starts holds the shell's output open.
 */
const STARTED = "/usr/bin:/bin:/usr/sbin:/sbin";

/** Reads the PATH with a real `shell` in a fresh home holding `files` (home-relative path to contents), timing it. */
async function readWith(shell: string, files: Record<string, string>, timeoutMs: number) {
  const home = await mkdtemp(join(tmpdir(), "featra-login-home-"));
  try {
    for (const [file, contents] of Object.entries(files)) {
      await mkdir(dirname(join(home, file)), { recursive: true });
      await writeFile(join(home, file), contents);
    }
    const started = Date.now();
    const found = await readLoginPath({
      platform: "linux",
      env: { PATH: STARTED, SHELL: shell, HOME: home, ENV: "", ZDOTDIR: home, XDG_CONFIG_HOME: join(home, ".config") },
      home,
      timeoutMs,
    });
    return { found, took: Date.now() - started, home };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

const readWithProfile = (profile: string, timeoutMs: number) => readWith("/bin/sh", { ".profile": profile }, timeoutMs);

/** Where the shell is installed, or null. */
const installed = (name: string) =>
  ["/bin", "/usr/bin", "/usr/local/bin", "/opt/homebrew/bin"].map((dir) => join(dir, name)).find(existsSync) ?? null;

const POSIX_PROFILE = 'PATH="$HOME/tools/bin:$PATH"\nexport PATH\necho "profile says hi"\n';
const CSH_PROFILE = 'setenv PATH "$HOME/tools/bin:$PATH"\necho "cshrc says hi"\n';

/** Each shell, and the startup file the user sets their PATH in. */
const SHELLS: { name: string; files: Record<string, string> }[] = [
  { name: "sh", files: { ".profile": POSIX_PROFILE } },
  { name: "bash", files: { ".bash_profile": POSIX_PROFILE } },
  { name: "zsh", files: { ".zprofile": POSIX_PROFILE, ".zshrc": "" } },
  { name: "fish", files: { ".config/fish/config.fish": 'set -gx PATH $HOME/tools/bin $PATH\necho "fish says hi"\n' } },
  { name: "csh", files: { ".cshrc": CSH_PROFILE } },
  { name: "tcsh", files: { ".cshrc": CSH_PROFILE } },
];

describe("the login shell's PATH from each shell (STORY-64)", () => {
  for (const { name, files } of SHELLS) {
    const shell = installed(name);
    it.skipIf(shell === null)(`reads it from ${name}`, async () => {
      const { found, home } = await readWith(shell!, files, 10_000);
      expect(found.source, found.source === "fallback" ? found.reason : "").toBe("login shell");
      expect(found.path.split(":")[0]).toBe(join(home, "tools", "bin"));
      expect(found.path.split(":")).toEqual(expect.arrayContaining(STARTED.split(":")));
    });
  }

  // nushell keeps its startup files apart from a command it runs; only its answer is checked.
  const nu = installed("nu");
  it.skipIf(nu === null)("reads it from nu", async () => {
    const { found } = await readWith(nu!, {}, 10_000);
    expect(found.source, found.source === "fallback" ? found.reason : "").toBe("login shell");
    expect(found.path.split(":")).toEqual(expect.arrayContaining(STARTED.split(":")));
  });
});

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
