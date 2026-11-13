/**
 * The local API's methods that end a story (STORY-12, STORY-58): Merge, and Abandon's check and confirm. Both are
 * always the user's click; without their module the method is refused.
 */
import { abandonParams, cardParams } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { StoryAbandon } from "./story-abandon.ts";
import type { StoryMerge } from "./story-merge.ts";

export interface StoryEndApiDeps {
  merges?: Pick<StoryMerge, "merge">;
  abandons?: Pick<StoryAbandon, "check" | "abandon">;
  /** The project folder, once it is known to be open; throws otherwise. */
  allow: (dir: string) => string;
}

export type StoryEndMethod = "story.merge" | "story.abandonCheck" | "story.abandon";

function card(params: unknown) {
  const p = cardParams(params);
  if (!p) throw new ApiError("Expected { dir, id }.");
  return p;
}

export function createStoryEndApi({ merges, abandons, allow }: StoryEndApiDeps) {
  const abandoning = () => {
    if (!abandons) throw new ApiError("Abandoning isn't available.");
    return abandons;
  };

  return async (method: StoryEndMethod, params: unknown) => {
    if (method === "story.merge") {
      const p = card(params);
      if (!merges) throw new ApiError("Merging isn't available.");
      return merges.merge(allow(p.dir), p.id);
    }
    if (method === "story.abandonCheck") {
      const p = card(params);
      return abandoning().check(allow(p.dir), p.id);
    }
    const p = abandonParams(params);
    if (!p) throw new ApiError("Expected { dir, id, keep, token }.");
    return abandoning().abandon(allow(p.dir), p.id, { keep: p.keep, token: p.token });
  };
}
