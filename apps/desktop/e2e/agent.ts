import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The faked agent for the chat journeys: a stand-in `claude` on the PATH (found, never run) and the Agent SDK's
 * `query` as fake-agent-sdk.mjs (ADR 0013).
 */
export const FAKE_SDK = fileURLToPath(new URL("fake-agent-sdk.mjs", import.meta.url));
const CLAUDE = process.platform === "win32" ? "claude.exe" : "claude";

/** The PATH variable's own key: on Windows it is usually `Path`, and a second `PATH` would be ambiguous. */
export const PATH_KEY = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const hasClaude = (dir: string) => ["claude", "claude.exe", "claude.cmd"].some((f) => existsSync(join(dir, f)));
/** The PATH's folders, less any that hold a real `claude`. */
export const pathWithoutClaude = () =>
  (process.env[PATH_KEY] ?? "")
    .split(delimiter)
    .filter(Boolean)
    .filter((d) => !hasClaude(d));

export async function tempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return { dir, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }) };
}

/** A folder holding a stand-in `claude`, its path as `where` and `which` name it, and the PATH with it first. */
export async function standInClaude() {
  const bin = await tempDir("featra-claude-");
  await writeFile(join(bin.dir, CLAUDE), "");
  await chmod(join(bin.dir, CLAUDE), 0o755);
  // On Windows the temp folder can be an 8.3 short path.
  const claude = realpathSync.native(join(bin.dir, CLAUDE));
  return { ...bin, claude, path: [bin.dir, ...pathWithoutClaude()].join(delimiter) };
}
