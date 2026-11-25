/** The local API's proof methods (STORY-25): Project settings' Proof section, and a story's Preview. */
import { dirParams, isRecord, normalizeProofPatch } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { ProofCapture } from "./proof-capture.ts";
import type { ProofSettings } from "./proof-settings.ts";

export type ProofMethod = "proof.load" | "proof.set" | "preview.start";

export interface ProofApiDeps {
  proof?: { settings: Pick<ProofSettings, "load" | "set">; capture: Pick<ProofCapture, "preview"> };
  /** The folder if it is an open project; throws otherwise. */
  allow: (dir: string) => string;
}

export function createProofApi({ proof, allow }: ProofApiDeps) {
  return async (method: ProofMethod, params: unknown) => {
    const dir = dirParams(params)?.dir;
    if (dir === undefined) throw new ApiError("Expected { dir }.");
    if (!proof) throw new ApiError("Proof isn't available.");
    const p = isRecord(params) ? params : {};
    if (method === "proof.load") return proof.settings.load(allow(dir));
    if (method === "proof.set") {
      const patch = normalizeProofPatch(p.patch);
      if (!patch) throw new ApiError("Expected { dir, patch }.");
      return proof.settings.set(allow(dir), patch);
    }
    if (typeof p.id !== "string" || !p.id) throw new ApiError("Expected { dir, id }.");
    return proof.capture.preview(allow(dir), p.id);
  };
}
