import { useEffect, useState } from "react";
import { canResume } from "@featra/work-format";
import type { WorkBridge } from "../../work-list.ts";
import { useWorkList } from "../work/useWorkList.ts";
import type { ChatViewProps } from "./ChatView.tsx";

/**
 * What a story session's header needs of its story (STORY-53): whether it is Stopped, whether Resume applies, and
 * whether the session waits for a slot. Undefined for any other chat, which watches neither the Work list nor the chat list.
 */
export function useStoryTurn(work: WorkBridge, { chats, chat, dir }: Pick<ChatViewProps, "chats" | "chat" | "dir">) {
  const story = chat.story ?? null;
  const [summary, setSummary] = useState<{ queued: boolean; stalled: boolean }>({ queued: false, stalled: false });
  useEffect(() => {
    if (story === null) return undefined;
    return chats.list(dir, (update) => {
      const mine = update.list.chats.find((c) => c.id === chat.id);
      setSummary({ queued: mine?.queued === true, stalled: mine?.stalled === true });
    });
  }, [chats, dir, chat.id, story]);
  const row = useWorkList(work, story === null ? null : dir)
    ?.list.epics.flatMap((e) => e.features)
    .flatMap((f) => f.stories)
    .find((s) => s.id === story);
  if (story === null) return undefined;
  const stopped = row?.stopped === true;
  return {
    stopped,
    // A merged story's session is history: nothing resumes it (STORY-12).
    resumable: row !== undefined && !row.merged && canResume(stopped, summary.stalled, row.tone),
    queued: summary.queued,
    awaiting: row?.awaiting === true,
    mergeable: row?.mergeable === true,
  };
}
