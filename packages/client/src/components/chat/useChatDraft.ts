import { useWorkList } from "../work/useWorkList.ts";
import type { WorkBridge } from "../../work-list.ts";

/**
 * The card id of the draft `chat` made (STORY-8): undefined until the Work list is first read, null when the chat has
 * no draft waiting on review. Read from the Work list, which is the one place that knows what is a draft.
 */
export function useChatDraft(work: WorkBridge, dir: string, chat: string): string | null | undefined {
  const list = useWorkList(work, dir)?.list;
  if (!list) return undefined;
  for (const epic of list.epics)
    for (const f of epic.features) if (f.review && f.draftedBy === chat && f.id) return f.id;
  return null;
}
