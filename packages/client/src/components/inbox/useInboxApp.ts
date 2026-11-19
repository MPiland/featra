import { waitMs } from "@featra/work-format/inbox";
import type { FeatraBridge } from "../../bridge.ts";
import { useProjectNeeds } from "../useProjectNeeds.ts";
import { useInbox, useNotifications } from "./useInbox.ts";
import { useOpenChatIn } from "./useOpenChatIn.ts";

/**
 * The app's Inbox (STORY-7): the waiting requests of every open project, their notifications, and opening a chat; and
 * what each project needs from the user, for the project switcher (STORY-66).
 */
export function useInboxApp(
  bridge: FeatraBridge,
  inboxWaitMinutes: number,
  projectDir: string | null,
  switchTo: (dir: string) => void,
  openChat: (chat: string) => void,
) {
  const openChatIn = useOpenChatIn(projectDir, switchTo, openChat);
  const inbox = useInbox(bridge.inbox, projectDir !== null, waitMs(inboxWaitMinutes));
  useNotifications(bridge.inbox, bridge.notifications, projectDir !== null, openChatIn);
  const needs = useProjectNeeds(bridge.needs);
  return { items: inbox.items, openChatIn, needs };
}
