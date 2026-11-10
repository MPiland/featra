import { newestDraft } from "@featra/work-format";
import { useWorkList } from "../work/useWorkList.ts";
import type { WorkBridge } from "../../work-list.ts";

/**
 * The card id of the draft `chat` made (STORY-8): undefined until the Work list is first read, null when the chat has
 * no draft waiting on review. Read from the Work list, which is the one place that knows what is a draft.
 */
export function useChatDraft(work: WorkBridge, dir: string, chat: string): string | null | undefined {
  const list = useWorkList(work, dir)?.list;
  if (!list) return undefined;
  // The same rule the server revises by: the chat's newest draft, and it only counts while it waits on review.
  const drafts = list.epics
    .flatMap((e) => e.features)
    .map((f) => ({ id: f.id, chat: f.draftedBy ?? null, review: f.review === true }));
  const mine = newestDraft(chat, drafts);
  return mine?.review ? mine.id : null;
}
