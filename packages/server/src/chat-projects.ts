import { savedChat, type ProviderId, type SavedChat } from "@featra/work-format";
import { composerOf } from "./chat-composer.ts";
import { restored, type Chat } from "./chat-state.ts";
import type { ProviderAdapter } from "./provider.ts";

/** Brings the saved chats not yet loaded into the manager, and tells each project's list. */
export function restoreChats(
  chats: Map<string, Chat>,
  saved: readonly SavedChat[],
  listChanged: (dir: string) => void,
) {
  const dirs = new Set<string>();
  for (const s of saved.filter((c) => !chats.has(c.summary.id))) {
    chats.set(s.summary.id, restored(s.summary.id, s.dir, s.summary, s.session, s.composer ?? null, s.cwd));
    dirs.add(s.dir);
  }
  for (const dir of dirs) listChanged(dir);
}

/** What the manager saves: every chat that has started (a queued story session has not), but no subagent (STORY-55). */
export function chatsToSave(chats: Map<string, Chat>, provider: (id: ProviderId) => ProviderAdapter | undefined) {
  return [...chats.values()]
    .filter((c) => !c.summary.queued && !c.summary.subagent)
    .map((c) => savedChat(c.dir, c.session, c.summary, composerOf(c, provider(c.summary.provider)), c.cwd));
}

/** A project the user closed ends its chats; one opened again brings them back. */
export function closeProjects(
  chats: Map<string, Chat>,
  keep: (dir: string) => boolean,
  end: (c: Chat) => void,
  listChanged: (dir: string) => void,
) {
  const changed = new Set<string>();
  for (const c of chats.values()) {
    if (c.closed === !keep(c.dir)) continue;
    if (c.closed) c.closed = false;
    else {
      end(c);
      c.closed = true;
    }
    changed.add(c.dir);
  }
  for (const dir of changed) listChanged(dir);
}
