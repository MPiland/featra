/**
 * Opening an evidence file with the OS (STORY-72, ADR 0043). The server copies the file into the app's data folder;
 * the page passes that copy's path here, and the page is not trusted: only a plain file inside that folder is taken,
 * and only a document or an image is opened. Anything else (a program, a page, a shortcut) is shown in its folder.
 */
import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative } from "node:path";
import { EVIDENCE_OPEN_DIR, EVIDENCE_OPENABLE, evidenceExtension } from "@featra/work-format/evidence-link";

/** How the OS is given the copy: opened with its app, or shown in its folder. */
export interface EvidenceOpening {
  how: "open" | "show";
  file: string;
}

/** The OS side of opening: Electron's `shell`, or what an E2E run or a test records instead. */
export interface EvidenceShell {
  /** Opens the file with its app; an error message, or "" when it opened. */
  openPath: (file: string) => Promise<string>;
  showItemInFolder: (file: string) => void;
}

/** How the evidence copy `file` is given to the OS, or null when it isn't a copy in `dataDir`'s evidence folder. */
export async function evidenceOpening(dataDir: string, file: unknown): Promise<EvidenceOpening | null> {
  if (typeof file !== "string" || !isAbsolute(file)) return null;
  try {
    const [real, base] = await Promise.all([realpath(file), realpath(join(dataDir, EVIDENCE_OPEN_DIR))]);
    const rel = relative(base, real);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel) || !(await stat(real)).isFile()) return null;
    return { how: EVIDENCE_OPENABLE.includes(evidenceExtension(basename(real))) ? "open" : "show", file: real };
  } catch {
    return null;
  }
}

/**
 * Gives the evidence copy `file` to the OS as `evidenceOpening` decides: a document or image opened with `os.openPath`,
 * anything else only shown in its folder, never opened; nothing at all for a path that isn't such a copy.
 */
export async function openEvidenceFile(
  dataDir: string,
  file: unknown,
  os: EvidenceShell,
  log: (message: string) => void,
): Promise<EvidenceOpening | null> {
  const opening = await evidenceOpening(dataDir, file);
  if (!opening) {
    log("Evidence not opened: not a copy in the data folder");
  } else if (opening.how === "show") {
    os.showItemInFolder(opening.file);
  } else {
    const failed = await os.openPath(opening.file);
    if (failed) log(`Can't open evidence: ${failed}`);
  }
  return opening;
}
