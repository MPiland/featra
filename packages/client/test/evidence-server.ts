// The local server's evidence side (STORY-72), as a fake: the files on disk are the test's to give, by path. Which
// files the server may read (a card's own evidence folder, linked by a criterion) is the server's to prove.
import { EVIDENCE_COPY, type EvidenceFile } from "@featra/work-format/evidence-link";
import type { EvidenceBridge } from "../src/evidence.ts";

/** Where the fake server copies a file it opens, as the server copies into its data folder. */
export const OPEN_COPY = "/data/evidence-open/1";

export function fakeEvidenceServer(files: Record<string, EvidenceFile>, calls: string[]): EvidenceBridge {
  const fileOf = (path: string): EvidenceFile => files[path] ?? { ok: false, problem: "missing" };
  return {
    readEvidence: async (dir, id, path) => {
      calls.push(`readEvidence:${dir}:${id}:${path}`);
      return fileOf(path);
    },
    openEvidence: async (dir, id, path) => {
      calls.push(`openEvidence:${dir}:${id}:${path}`);
      const file = fileOf(path);
      if (!file.ok) return { ok: false, error: EVIDENCE_COPY[file.problem] };
      return { ok: true, file: `${OPEN_COPY}/${file.name}` };
    },
  };
}
