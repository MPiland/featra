/**
 * Featra's own Allow for this chat rule (STORY-45, ADR 0018), used when the provider suggests none for a request.
 * Each rule is narrow and fails closed: a call it can't place gets no rule, so Allow for this chat isn't offered and
 * the call is always asked about.
 */
import { isRecord } from "./utils/guards.ts";

/** A rule Allow for this chat remembers: calls with the same `key` are the same permission; `covers` says what. */
export interface ChatRule {
  key: string;
  covers: string;
}

/** Tools whose input is a shell command: a rule covers the exact command, run the same way. */
export const SHELL_TOOLS: readonly string[] = ["Bash", "PowerShell"];

/** File tools a rule covers inside the chat's working folder. */
export const FILE_TOOLS: readonly string[] = ["Write", "Edit"];

/** Folders inside the working folder that a rule never covers: git's own data and Claude's settings. */
export const GUARDED_FOLDERS: readonly string[] = [".git", ".claude"];

/**
 * A shell call's fields that don't change what runs or how it is sandboxed: its label, how long it may take, and
 * whether the agent waits for it. Every other field, known or not (`dangerouslyDisableSandbox`, or one the SDK adds
 * later), is part of the permission, so a rule never covers a call that runs differently.
 */
export const SHELL_FIELDS_IGNORED: readonly string[] = ["description", "timeout", "run_in_background"];

const text = (input: unknown, field: string): string | null =>
  isRecord(input) && typeof input[field] === "string" && input[field] !== "" ? input[field] : null;

/** A shell call's input as a key: every field but the ignored ones, in a fixed order. */
function shellKey(input: Record<string, unknown>): string {
  const kept = Object.keys(input)
    .filter((k) => !SHELL_FIELDS_IGNORED.includes(k) && input[k] !== undefined)
    .toSorted()
    .map((k) => [k, input[k]]);
  return JSON.stringify(kept);
}

const isAbsolute = (p: string) => /^[\\/]/.test(p) || /^[a-zA-Z]:[\\/]/.test(p);

/** A path's segments with `.` and `..` resolved; null when `..` climbs above its root. */
function segments(p: string): string[] | null {
  const out: string[] = [];
  for (const part of p.split(/[\\/]+/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out;
}

/**
 * A path's real path with links resolved, or null when it can't be found. Work-format never reads the disk, so the
 * caller that can supplies it.
 */
export type RealPath = (path: string) => string | null;

/** `file` as an absolute path; null for one the tool might expand (`~`), a drive-relative one, or a relative `cwd`. */
function absolutePath(file: string, cwd: string): string | null {
  if (file.startsWith("~") || /^[a-zA-Z]:(?![\\/])/.test(file) || !isAbsolute(cwd)) return null;
  return isAbsolute(file) ? file : `${cwd}/${file}`;
}

/** Where an absolute path is, as written: inside `cwd`, inside one of its guarded folders, or outside it. */
function placeOf(path: string, cwd: string): "inside" | "guarded" | "outside" {
  const windows = /^[a-zA-Z]:/.test(cwd) || /^[a-zA-Z]:/.test(path);
  const fold = (s: string) => (windows ? s.toLowerCase() : s);
  const root = segments(cwd);
  const parts = segments(path);
  if (!root || !parts || parts.length <= root.length) return "outside";
  if (!root.every((part, i) => fold(part) === fold(parts[i] ?? ""))) return "outside";
  const guarded = parts.slice(root.length).some((part) => GUARDED_FOLDERS.includes(part.toLowerCase()));
  return guarded ? "guarded" : "inside";
}

/**
 * True when `file` is inside `cwd` and outside its guarded folders. Paths on Windows compare without case, and
 * anything the tool might expand (`~`) or a drive-relative path is treated as outside.
 *
 * With `realPath`, links decide: the file's real path must be inside the folder's real path and outside its guarded
 * folders, and the path as written must not name a guarded folder either. A path that can't be resolved, or one with
 * `..` (which the OS and the tool may resolve differently around a link), is treated as outside.
 */
export function insideFolder(file: string, cwd: string, realPath?: RealPath): boolean {
  const path = absolutePath(file, cwd);
  if (path === null) return false;
  const written = placeOf(path, cwd);
  if (!realPath) return written === "inside";
  if (written === "guarded" || file.split(/[\\/]+/).includes("..")) return false;
  const realFile = realPath(path);
  const realCwd = realPath(cwd);
  return realFile !== null && realCwd !== null && placeOf(realFile, realCwd) === "inside";
}

const hostOf = (url: string): string | null => {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === "https:" || protocol === "http:") && hostname ? hostname.toLowerCase() : null;
  } catch {
    return null;
  }
};

/**
 * Featra's rule for a call, or null when it has none:
 * - a shell tool: the exact command, run the same way (every field but `SHELL_FIELDS_IGNORED`);
 * - Write and Edit: any path inside the chat's working folder, outside `.git` and `.claude` (real paths, given
 *   `realPath`);
 * - WebFetch: the URL's domain;
 * - an MCP tool (`mcp__…`): the tool.
 */
export function chatRule(name: string, input: unknown, cwd: string, realPath?: RealPath): ChatRule | null {
  if (SHELL_TOOLS.includes(name)) {
    const command = text(input, "command");
    if (command === null || !isRecord(input)) return null;
    return { key: `${name}\u0000${shellKey(input)}`, covers: `This command: ${command}` };
  }
  if (FILE_TOOLS.includes(name)) {
    const file = text(input, "file_path");
    if (file === null || !insideFolder(file, cwd, realPath)) return null;
    return { key: `${name}\u0000folder`, covers: name === "Write" ? "Writes in this folder" : "Edits in this folder" };
  }
  if (name === "WebFetch") {
    const url = text(input, "url");
    const host = url === null ? null : hostOf(url);
    return host === null ? null : { key: `${name}\u0000${host}`, covers: `Fetches from ${host}` };
  }
  if (name.startsWith("mcp__")) return { key: name, covers: `Every ${name} call` };
  return null;
}
