/**
 * Where the session manager keeps its chats (STORY-44, ADR 0018): `chats.json` in the app's data, never the repo.
 * A restored chat's transcript is read back from its provider's own session, through the adapter.
 */
import {
  errorMessage,
  normalizeSavedChats,
  type ChatEvent,
  type SavedChat,
  type SavedChats,
} from "@featra/work-format";
import { createJsonStore, type JsonStore } from "./json-store.ts";
import type { ProviderAdapter } from "./provider.ts";

/** Where the manager keeps its chats: `chats.json` in the app's data, or nowhere (`memoryChatStore`). */
export type ChatStore = Pick<JsonStore<SavedChats>, "load" | "save">;

export const memoryChatStore = (): ChatStore => ({
  load: async () => ({ version: 1, chats: [] }),
  save: async () => {},
});

/** The file in the app's data folder that keeps the chats. */
export const CHATS_FILE = "chats.json";

/** `chats.json` in the app's data folder. */
export function fileChatStore(dir: string): ChatStore & { file: string } {
  const json = createJsonStore(dir, CHATS_FILE, normalizeSavedChats);
  return { file: json.file, load: json.read, save: json.save };
}

/**
 * The manager's saved chats: read once, then saved after each change. Nothing is saved before the read, so a save never
 * drops a chat not yet read; and a file that couldn't be read is never saved over, so this run's chats stay in memory.
 */
export function chatSaver(
  store: ChatStore,
  log: (message: string) => void,
  restore: (saved: readonly SavedChat[]) => void,
  current: () => SavedChat[],
) {
  let keepOff = false;
  const loaded = store.load().then(
    (file) => restore(file.chats),
    (err: unknown) => {
      keepOff = true;
      log(`Couldn't read the saved chats, so this run's chats won't be saved: ${errorMessage(err)}`);
    },
  );
  let saving: Promise<void> = loaded;
  return {
    loaded,
    save() {
      saving = saving
        .then(() => (keepOff ? undefined : store.save({ version: 1, chats: current() })))
        .catch((err: unknown) => log(`Couldn't save the chats: ${errorMessage(err)}`));
    },
    flush: () => saving,
  };
}

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
