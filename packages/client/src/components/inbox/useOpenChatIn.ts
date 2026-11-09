import { useCallback, useEffect, useRef } from "react";

/**
 * Opens a chat that may be in another project: switches to that project first, and opens the chat once it is the
 * current one (the switch forgets the old project's chat, so it can't be opened sooner).
 */
export function useOpenChatIn(
  currentDir: string | null,
  switchTo: (dir: string) => void,
  openChat: (chat: string) => void,
): (chat: string, project?: string) => void {
  const waiting = useRef<{ dir: string; chat: string } | null>(null);
  useEffect(() => {
    const next = waiting.current;
    if (next && next.dir === currentDir) {
      waiting.current = null;
      openChat(next.chat);
    }
  }, [currentDir, openChat]);
  return useCallback(
    (chat, project) => {
      if (!project || project === currentDir) {
        waiting.current = null;
        openChat(chat);
        return;
      }
      waiting.current = { dir: project, chat };
      switchTo(project);
    },
    [currentDir, switchTo, openChat],
  );
}
