/**
 * The local API's proof methods (STORY-25): Project settings' Proof section, a story's Preview, the user's clear of
 * its design review (STORY-73), and the Browser pane's dev servers (STORY-74).
 */
import { dirParams, isRecord, normalizeProofPatch } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { Connection } from "./api.ts";
import type { BrowserPreview } from "./browser-preview.ts";
import type { DesignReviews } from "./design-reviews.ts";
import type { ProofCapture } from "./proof-capture.ts";
import type { ProofSettings } from "./proof-settings.ts";

export type ProofMethod =
  | "proof.load"
  | "proof.set"
  | "preview.start"
  | "browser.start"
  | "browser.stop"
  | "story.clearDesignReview";

export interface ProofApiDeps {
  proof?: {
    settings: Pick<ProofSettings, "load" | "set">;
    capture: Pick<ProofCapture, "preview">;
    design?: Pick<DesignReviews, "clear">;
    browser?: Pick<BrowserPreview, "start" | "stop">;
  };
  /** The folder if it is an open project; throws otherwise. */
  allow: (dir: string) => string;
}

export function createProofApi({ proof, allow }: ProofApiDeps) {
  return async (method: ProofMethod, params: unknown, request: number, connection: Connection) => {
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
    if (method === "preview.start") return proof.capture.preview(allow(dir), p.id);
    if (method === "browser.start" || method === "browser.stop") {
      const { browser } = proof;
      if (!browser) throw new ApiError("The Browser pane isn't available.");
      // The page's key for its pane: one per pane it opens, never reused.
      const pane = typeof p.pane === "string" && p.pane && p.pane.length <= 100 ? p.pane : null;
      if (!pane) throw new ApiError("Expected { dir, id, pane }.");
      if (method === "browser.stop") return browser.stop(pane);
      // The pane is let go when the page's socket closes: reloaded, crashed or gone.
      return browser.start(pane, allow(dir), p.id, (stop) => {
        connection.keep(request, stop);
        return () => connection.unwatch(request);
      });
    }
    if (!proof.design) throw new ApiError("The design review isn't available.");
    return proof.design.clear(allow(dir), p.id);
  };
}
