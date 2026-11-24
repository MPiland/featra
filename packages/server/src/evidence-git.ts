/**
 * An evidence file read from git (STORY-72): for a card whose owner isn't checked out, such as a merged story's on its
 * feature branch, the file is the one the owner's commit has. Only a plain file (no link, no submodule) at exactly that
 * path, and no bigger than evidence may be (ADR 0043).
 */
import { execFile } from "node:child_process";
import { EVIDENCE_BYTES, isRecord } from "@featra/work-format";
import { gitEnv, runGit, spawnError } from "./git-run.ts";

export type GitEvidence = { ok: true; bytes: Buffer } | { ok: false; problem: "missing" | "unreadable" };

const PLAIN_FILES = new Set(["100644", "100755"]);

/** `git <args>` in `dir`, its output as bytes; null when it fails. */
function gitBytes(command: string, dir: string, args: string[]): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd: dir, env: gitEnv(), windowsHide: true, encoding: "buffer", maxBuffer: EVIDENCE_BYTES + 1 },
      (err, stdout) => {
        if (err && isRecord(err) && err.code === "ENOENT") return reject(spawnError(err));
        resolve(err ? null : stdout);
      },
    );
  });
}

/** The evidence file at `path` in commit `rev` of the repository at `dir`, or why it can't be read. */
export async function evidenceInGit(command: string, dir: string, rev: string, path: string): Promise<GitEvidence> {
  const listed = await runGit(command, dir, ["--literal-pathspecs", "ls-tree", "-l", "-z", rev, "--", path]);
  if (listed.code !== 0) return { ok: false, problem: "unreadable" };
  const entry = listed.stdout.split("\0").find((e) => e.slice(e.indexOf("\t") + 1) === path);
  if (entry === undefined) return { ok: false, problem: "missing" };
  const [mode, type, object, size] = entry.slice(0, entry.indexOf("\t")).split(/\s+/);
  if (!mode || !PLAIN_FILES.has(mode) || type !== "blob" || !object) return { ok: false, problem: "unreadable" };
  if (Number(size) > EVIDENCE_BYTES) return { ok: false, problem: "unreadable" };
  const bytes = await gitBytes(command, dir, ["cat-file", "blob", object]);
  return bytes && bytes.length <= EVIDENCE_BYTES ? { ok: true, bytes } : { ok: false, problem: "unreadable" };
}
