/** The local API's evidence methods (STORY-72): read an evidence file to show it, and copy one for the OS to open. */
import { evidenceParams } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { EvidenceFiles } from "./evidence-files.ts";

export type EvidenceMethod = "evidence.read" | "evidence.open";

export interface EvidenceApiDeps {
  evidence?: EvidenceFiles;
  /** The folder if it is an open project; throws otherwise. */
  allow: (dir: string) => string;
}

export function createEvidenceApi({ evidence, allow }: EvidenceApiDeps) {
  return async (method: EvidenceMethod, params: unknown) => {
    const p = evidenceParams(params);
    if (!p) throw new ApiError("Expected { dir, id, path }.");
    const dir = allow(p.dir);
    if (!evidence) throw new ApiError("Evidence isn't available.");
    return method === "evidence.read" ? evidence.read(dir, p.id, p.path) : evidence.open(dir, p.id, p.path);
  };
}
