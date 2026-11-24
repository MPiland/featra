/**
 * The evidence bridge (STORY-72, ADR 0043): an evidence file a criterion links, read through the server, which reads
 * only that card's own evidence folder; and a file opened with the OS, which the server copies for the host to open.
 */
import { normalizeEvidenceFile, type EvidenceFile } from "@featra/work-format/evidence-link";
import { errorMessage, isRecord } from "@featra/work-format/guards";
import type { ServerClient } from "./server-client.ts";

export type { EvidenceFile };

/** The copy of an evidence file made for the OS to open, or why it can't be. */
export type EvidenceOpenResult = { ok: true; file: string } | { ok: false; error: string };

export interface EvidenceBridge {
  /** Evidence file `path` of card `id`: a screenshot's bytes, another file's name, or why it can't be shown. */
  readEvidence: (dir: string, id: string, path: string) => Promise<EvidenceFile>;
  /** Copies evidence file `path` of card `id` for the OS to open; the copy's path. */
  openEvidence: (dir: string, id: string, path: string) => Promise<EvidenceOpenResult>;
}

export function serverEvidence(server: ServerClient): EvidenceBridge {
  return {
    readEvidence: (dir, id, path) =>
      server.call("evidence.read", { dir, id, path }).then(normalizeEvidenceFile, () => normalizeEvidenceFile(null)),
    openEvidence: (dir, id, path) =>
      server.call("evidence.open", { dir, id, path }).then(
        (r): EvidenceOpenResult =>
          isRecord(r) && typeof r.file === "string" && r.file
            ? { ok: true, file: r.file }
            : { ok: false, error: "Something went wrong." },
        (err: unknown): EvidenceOpenResult => ({ ok: false, error: errorMessage(err) }),
      ),
  };
}

/** A browser tab has no folders, so no evidence. */
export function noEvidence(error: string): EvidenceBridge {
  return {
    readEvidence: async () => ({ ok: false, problem: "unreadable" }),
    openEvidence: async () => ({ ok: false, error }),
  };
}
