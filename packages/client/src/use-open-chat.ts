import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { chatEntry, navigate, type NavState } from "./navigation.ts";

/**
 * How the app goes to a chat. `reviewChat` is the chat to show its draft pane in when it opens (STORY-49): set by
 * Review draft in Work, cleared by any other way into a chat.
 */
export function useOpenChat(setNav: Dispatch<SetStateAction<NavState>>) {
  const [reviewChat, setReviewChat] = useState<string | null>(null);
  const go = useCallback(
    (id: string, review: string | null) => {
      setReviewChat(review);
      setNav((n) => navigate(n, chatEntry(id)));
    },
    [setNav],
  );
  const openChat = useCallback((id: string) => go(id, null), [go]);
  const reviewDraft = useCallback((id: string) => go(id, id), [go]);
  return { reviewChat, openChat, reviewDraft };
}
