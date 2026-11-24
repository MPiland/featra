/**
 * The Dev Lead leading a feature: the chat that drafted it (its `drafted-by`), else one that started a story under it.
 * What Merge to main tells about the base moving on (STORY-14), where "Not yet" sends its reason (STORY-71), and the
 * only chat that may write the feature's summary (STORY-69) or reply to the changes asked on it (STORY-71).
 */
import { draftedBy, notLeadOf } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
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

/** Refuses `chat` unless it leads the feature: what it writes reads as written by the feature's Dev Lead. */
export function mustLead(
  chats: Pick<ChatManager, "list">,
  dir: string,
  look: Pick<FeatureLook, "card" | "scan">,
  chat: string,
): void {
  if (leadOf(chats, dir, look) !== chat) throw new ApiError(notLeadOf(look.card.id));
}
