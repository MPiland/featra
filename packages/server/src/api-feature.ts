/**
 * The local API's methods that end a feature (STORY-14): Accept, Create PR, Run checks again and Merge to main. All
 * are the user's clicks; without their module each is refused.
 */
import { ApiError } from "./api-error.ts";
import type { FeatureEnd } from "./feature-end.ts";

export interface FeatureApiDeps {
  features?: Pick<
    FeatureEnd,
    "accept" | "createPr" | "rerunChecks" | "merge" | "mergeState" | "prState" | "checksFor" | "focus"
  >;
  /** A card's folder, an open project, and its id; throws otherwise. */
  card: (params: unknown) => [dir: string, id: string];
}

export type FeatureMethod = "feature.accept" | "feature.createPr" | "feature.rerunChecks" | "feature.merge";

export function createFeatureApi({ features, card }: FeatureApiDeps) {
  return async (method: FeatureMethod, params: unknown) => {
    const [dir, id] = card(params);
    if (!features) throw new ApiError("Ending features isn't available.");
    if (method === "feature.accept") return features.accept(dir, id);
    if (method === "feature.createPr") return features.createPr(dir, id);
    if (method === "feature.rerunChecks") return features.rerunChecks(dir, id);
    return features.merge(dir, id);
  };
}
