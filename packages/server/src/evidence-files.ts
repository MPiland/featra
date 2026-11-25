/**
 * Evidence files read back for the app (STORY-72, ADR 0043): a screenshot or other file an agent linked to a criterion,
 * shown next to it. Only a file a criterion of that card links, inside the card's own evidence folder, read from the
 * copy the card is shown from: its working tree when checked out, else the commit git has for it (a merged story's
 * feature branch, say). Anything else, or anything that can't be read whole and small, is a problem to show, never an
 * error that breaks the criterion. Opening a file hands the OS a copy in the app's data folder, never the original.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EVIDENCE_BYTES,
  EVIDENCE_COPY,
  EVIDENCE_OPEN_DIR,
  errorMessage,
  evidenceImageType,
  evidenceLinkError,
  evidenceName,
  type EvidenceFile,
  type EvidenceProblem,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { locationKey } from "./collect.ts";
import { evidenceOnDisk } from "./evidence-disk.ts";
import { evidenceInGit } from "./evidence-git.ts";
import type { Scan } from "./work-scan.ts";

export interface EvidenceFilesDeps {
  /** The cards as shown: the watch's last good scan, so reading a file never rescans every card. */
  scan: (dir: string) => Promise<Scan | null>;
  /** The git to run; the one on the PATH by default. */
  gitCommand?: string;
  /** The app's data folder, where copies opened with the OS go; the system's temporary folder without it. */
  dataDir?: string;
  log: (message: string) => void;
}

type Bytes = { ok: true; bytes: Buffer } | { ok: false; problem: EvidenceProblem };

const problem = (p: EvidenceProblem): Bytes => ({ ok: false, problem: p });

export function createEvidenceFiles({ scan: scanDir, gitCommand = "git", dataDir, log }: EvidenceFilesDeps) {
  const openDir = join(dataDir ?? tmpdir(), EVIDENCE_OPEN_DIR);
  let cleared: Promise<void> | null = null;

  /** The bytes of `path`, linked by a criterion of card `id`, from the copy the card is shown from. */
  async function bytesOf(dir: string, id: string, path: string): Promise<Bytes> {
    const scan = await scanDir(dir);
    const owned = scan?.resolution.cards.find((c) => c.card.id === id);
    if (!scan || !owned) throw new ApiError("That card is gone.");
    const { card } = owned;
    if (!card.acs.some((a) => a.evidence === path) || evidenceLinkError(card, path) !== null) {
      return problem("unreadable");
    }
    const key = locationKey(owned.shownFrom);
    const root = scan.collected.roots.get(key);
    if (root !== undefined) {
      const disk = await evidenceOnDisk(root, path);
      if (!disk.ok) return problem(disk.problem === "missing" ? "missing" : "unreadable");
      const bytes = await readFile(disk.file).catch(() => null);
      return bytes && bytes.length <= EVIDENCE_BYTES ? { ok: true, bytes } : problem("unreadable");
    }
    const rev = scan.collected.heads.get(key);
    return rev ? evidenceInGit(gitCommand, scan.collected.paths.top, rev, path) : problem("missing");
  }

  /** Copies opened before are cleared once a run, so they don't pile up; one still open elsewhere may stay. */
  const clearOld = () =>
    (cleared ??= rm(openDir, { recursive: true, force: true }).catch((err: unknown) =>
      log(`Can't clear old evidence copies in ${openDir}: ${errorMessage(err)}`),
    ));

  return {
    /** The evidence file as the app shows it: a screenshot's bytes, another file's name, or why it can't be shown. */
    async read(dir: string, id: string, path: string): Promise<EvidenceFile> {
      const got = await bytesOf(dir, id, path);
      if (!got.ok) return got;
      const name = evidenceName(path);
      const mime = evidenceImageType(path);
      return mime
        ? { ok: true, kind: "image", name, mime, data: got.bytes.toString("base64") }
        : { ok: true, kind: "file", name };
    },
    /** Copies the evidence file into the app's data folder for the OS to open; the copy's path. */
    async open(dir: string, id: string, path: string): Promise<{ file: string }> {
      const got = await bytesOf(dir, id, path);
      if (!got.ok) throw new ApiError(EVIDENCE_COPY[got.problem]);
      await clearOld();
      const folder = join(openDir, randomBytes(8).toString("hex"));
      const file = join(folder, evidenceName(path));
      try {
        await mkdir(folder, { recursive: true });
        await writeFile(file, got.bytes, { flag: "wx" });
      } catch (err) {
        log(`Can't copy ${path} to open it: ${errorMessage(err)}`);
        throw new ApiError(EVIDENCE_COPY.unreadable);
      }
      return { file };
    },
  };
}

export type EvidenceFiles = ReturnType<typeof createEvidenceFiles>;
