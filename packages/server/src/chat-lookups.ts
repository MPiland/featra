import type { ChatManager } from "./chat-manager-types.ts";
import type { Chat } from "./chat-state.ts";
import type { ProviderAdapter } from "./provider.ts";

/** The manager's reads of its chats: what a chat holds now, and what is installed. Nothing here changes a chat. */
export function chatLookups(
  chats: Map<string, Chat>,
  chat: (id: string) => Chat,
  providers: readonly ProviderAdapter[],
): Pick<ChatManager, "watch" | "dirOf" | "info" | "providers"> {
  return {
    watch(id, listener) {
      const c = chat(id);
      c.listeners.add(listener);
      return {
        events: [...(c.events ?? [])],
        mode: c.mode,
        note: c.note,
        stop: () => c.listeners.delete(listener),
      };
    },
    dirOf: (id) => {
      const c = chats.get(id);
      return c && !c.closed ? c.dir : null;
    },
    info(id) {
      const c = chats.get(id);
      if (!c || c.closed || c.events === null) return null;
      return {
        dir: c.dir,
        session: `${c.summary.role.name} chat ${c.id.slice(0, 8)}`,
        story: c.summary.story !== undefined,
      };
    },
    providers: () =>
      Promise.all(
        providers.map(async (p) => ({ id: p.id, name: p.name, installed: await p.installed().catch(() => false) })),
      ),
  };
}
