/**
 * The local API's methods that end a feature (STORY-14, STORY-70): Approve, Create PR, Run checks again and Merge to main
 * (Approve's retry); and "Not yet" and its Dismiss (STORY-71). All are the user's clicks; without their module each is
 * refused.
 */
import { sendBackParams } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { ChangesService } from "./feature-changes.ts";
import type { FeatureEnd } from "./feature-end.ts";

export interface FeatureApiDeps {
  features?: Pick<
    FeatureEnd,
    "approve" | "createPr" | "rerunChecks" | "merge" | "mergeState" | "prState" | "checksFor" | "focus"
  >;
  /** Asks for changes on features and dismisses them (STORY-71). */
  changes?: Pick<ChangesService, "ask" | "dismiss">;
  /** A card's folder, an open project, and its id; throws otherwise. */
  card: (params: unknown) => [dir: string, id: string];
}

export type FeatureMethod =
  | "feature.approve"
  | "feature.createPr"
  | "feature.rerunChecks"
  | "feature.merge"
  | "feature.askChanges"
  | "feature.dismissChanges";

export function createFeatureApi({ features, changes, card }: FeatureApiDeps) {
  return async (method: FeatureMethod, params: unknown) => {
    const [dir, id] = card(params);
    if (method === "feature.askChanges" || method === "feature.dismissChanges") {
      if (!changes) throw new ApiError("Asking for changes isn't available.");
      if (method === "feature.dismissChanges") return changes.dismiss(dir, id).then(() => null);
      const p = sendBackParams(params);
      if (!p) throw new ApiError("Expected { dir, id, reason }.");
      return changes.ask(dir, id, p.reason);
    }
    if (!features) throw new ApiError("Ending features isn't available.");
    if (method === "feature.approve") return features.approve(dir, id);
    if (method === "feature.createPr") return features.createPr(dir, id);
    if (method === "feature.rerunChecks") return features.rerunChecks(dir, id);
    return features.merge(dir, id);
  };
}
