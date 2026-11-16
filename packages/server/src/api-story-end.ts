/**
 * The local API's methods that end a story (STORY-12, STORY-58): Merge, and Abandon's check and confirm; and Hold, which
 * keeps a story from merging on its own (STORY-61). Each is always the user's click; without its module the method is
 * refused.
 */
import { abandonParams, cardParams, holdParams } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { StoryAbandon } from "./story-abandon.ts";
import type { StoryHold } from "./story-hold.ts";
import type { StoryMerge } from "./story-merge.ts";

export interface StoryEndApiDeps {
  merges?: Pick<StoryMerge, "merge">;
  abandons?: Pick<StoryAbandon, "check" | "abandon">;
  holds?: Pick<StoryHold, "hold">;
  /** The project folder, once it is known to be open; throws otherwise. */
  allow: (dir: string) => string;
}

export type StoryEndMethod = "story.merge" | "story.hold" | "story.abandonCheck" | "story.abandon";

function card(params: unknown) {
  const p = cardParams(params);
  if (!p) throw new ApiError("Expected { dir, id }.");
  return p;
}

export function createStoryEndApi({ merges, abandons, holds, allow }: StoryEndApiDeps) {
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
    if (method === "story.hold") {
      const p = holdParams(params);
      if (!p) throw new ApiError("Expected { dir, id, held }.");
      if (!holds) throw new ApiError("Holding isn't available.");
      return holds.hold(allow(p.dir), p.id, p.held);
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
