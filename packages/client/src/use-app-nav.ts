import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { chatEntry, goBack, goForward, navigate, type NavState } from "./navigation.ts";
import type { ViewId } from "./views.ts";

/**
 * How the app moves between views and chats. `reviewChat` is the chat to show its draft pane in when it opens (STORY-49): set by
 * Review draft in Work, cleared by any other way into a chat.
 */
export function useAppNav(setNav: Dispatch<SetStateAction<NavState>>) {
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
  const open = useCallback((v: ViewId) => setNav((n) => navigate(n, v)), [setNav]);
  const back = useCallback(() => setNav(goBack), [setNav]);
  const forward = useCallback(() => setNav(goForward), [setNav]);
  /** Called once the chat has opened its draft pane: the request is used up. */
  const reviewed = useCallback(() => setReviewChat(null), []);
  return { reviewChat, openChat, reviewDraft, reviewed, open, back, forward };
}
