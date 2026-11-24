/**
 * The Dev Lead leading a feature: the chat that drafted it (its `drafted-by`), else one that started a story under it.
 * What Merge to main tells about the base moving on (STORY-14) and where "Not yet" sends its reason (STORY-71).
 */
import { draftedBy } from "@featra/work-format";
import type { ChatManager } from "./chat-manager.ts";
import type { FeatureLook } from "./feature-look.ts";

export function leadOf(
  chats: Pick<ChatManager, "list">,
  dir: string,
  look: Pick<FeatureLook, "card" | "scan">,
): string | null {
  const drafted = draftedBy(look.card);
  if (drafted) return drafted;
  const stories = new Set(
    look.scan.resolution.cards.filter(({ card }) => card.parent === look.card.id).map(({ card }) => card.id),
  );
  return chats.list(dir).find((c) => c.story && stories.has(c.story.id) && c.story.parent)?.story?.parent ?? null;
}
