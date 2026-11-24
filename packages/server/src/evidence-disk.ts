/**
 * An evidence file in a working tree (STORY-10, STORY-72): whether the path names a real, small, plain file inside the
 * card's evidence folder. Shared by the agent's report, which links it, and the app, which reads it back (ADR 0043).
 */
import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { EVIDENCE_BYTES } from "@featra/work-format";
import { fileIn } from "./card-actions.ts";

/** Why an evidence file in a working tree can't be used. */
export type DiskProblem = "missing" | "notFile" | "outside" | "tooBig";

export type DiskEvidence = { ok: true; file: string } | { ok: false; problem: DiskProblem };

const inside = (base: string, file: string): boolean => {
  const rel = relative(base, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** The real folder of the evidence path's first four parts (.featra/evidence/FEAT-N/STORY-M). */
const folderOf = (path: string): string[] => path.split("/").slice(0, 4);

/**
 * The evidence file at `path` (relative to `root`), or why it can't be used. Every part must be a real directory entry
 * by exactly that name (case and trailing dots included) and no part a link or junction (a linked `.featra`, `evidence`,
 * feature or story folder would lead anywhere in the checkout), the file a plain one, and its real path inside both the
 * root and the evidence folder. The size is advisory: the file can change after this looks.
 */
export async function evidenceOnDisk(root: string, path: string): Promise<DiskEvidence> {
  try {
    let dir = root;
    for (const part of path.split("/")) {
      if (!(await readdir(dir)).includes(part)) return { ok: false, problem: "missing" };
      dir = join(dir, part);
      if ((await lstat(dir)).isSymbolicLink()) return { ok: false, problem: "outside" };
    }
    const file = fileIn(root, path);
    const stat = await lstat(file);
    if (!stat.isFile()) return { ok: false, problem: "notFile" };
    const [real, realRoot, realFolder] = await Promise.all([
      realpath(file),
      realpath(root),
      realpath(join(root, ...folderOf(path))),
    ]);
    if (!inside(realRoot, real) || !inside(realFolder, real)) return { ok: false, problem: "outside" };
    return stat.size > EVIDENCE_BYTES ? { ok: false, problem: "tooBig" } : { ok: true, file: real };
  } catch {
    return { ok: false, problem: "missing" };
  }
}
