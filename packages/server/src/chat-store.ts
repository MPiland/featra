/**
 * Where the session manager keeps its chats (STORY-44, ADR 0018): `chats.json` in the app's data, never the repo.
 * A restored chat's transcript is read back from its provider's own session, through the adapter.
 */
import { errorMessage, type ChatEvent, type SavedChats } from "@featra/work-format";
import type { JsonStore } from "./json-store.ts";
import type { ProviderAdapter } from "./provider.ts";

/** Where the manager keeps its chats: `chats.json` in the app's data, or nowhere (`memoryChatStore`). */
export type ChatStore = Pick<JsonStore<SavedChats>, "load" | "save">;

export const memoryChatStore = (): ChatStore => ({
  load: async () => ({ version: 1, chats: [] }),
  save: async () => {},
});

const GONE: ChatEvent = { type: "problem", problem: { type: "gone" } };

/**
 * A restored chat's transcript from its provider. `gone` when the provider no longer has the session; a failed read
 * shows as a problem, and the chat can still go on.
 */
export async function savedHistory(
  adapter: ProviderAdapter | undefined,
  session: string | null,
  dir: string,
): Promise<{ events: ChatEvent[]; gone: boolean }> {
  if (!session || !adapter) return { events: [], gone: false };
  try {
    const history = await adapter.history(session, dir);
    return history === null ? { events: [GONE], gone: true } : { events: history, gone: false };
  } catch (err) {
    return { events: [{ type: "problem", problem: { type: "failed", message: errorMessage(err) } }], gone: false };
  }
}
