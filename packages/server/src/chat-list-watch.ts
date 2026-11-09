/**
 * Who hears a project's chat list (STORY-21, ADR 0018): each watcher gets the whole list again when a row changes or a
 * chat comes or goes. Folders compare as the project list compares them (STORY-44), so a project opened under another
 * case still hears its chats.
 */
import { errorMessage, type ChatSummary } from "@featra/work-format";

/** Calls each listener; one watcher's failure (a closed socket, say) must not stop the others or the agent. */
export function tellAll<T>(listeners: Iterable<(value: T) => void>, value: T, log: (message: string) => void) {
  for (const listener of listeners) {
    try {
      listener(value);
    } catch (err) {
      log(`A chat watcher failed: ${errorMessage(err)}`);
    }
  }
}

export function createListWatchers(
  list: (dir: string) => ChatSummary[],
  same: (a: string, b: string) => boolean,
  log: (message: string) => void,
) {
  const watchers = new Set<{ dir: string; listener: (chats: ChatSummary[]) => void }>();
  return {
    /** The project's list now, and again to `listener` after each change until `stop`. */
    watch(dir: string, listener: (chats: ChatSummary[]) => void) {
      const watcher = { dir, listener };
      watchers.add(watcher);
      return { chats: list(dir), stop: () => watchers.delete(watcher) };
    },
    /** Tells the project's watchers its list changed. */
    changed(dir: string) {
      const watching = [...watchers].filter((w) => same(w.dir, dir));
      if (watching.length > 0)
        tellAll(
          watching.map((w) => w.listener),
          list(dir),
          log,
        );
    },
    clear: () => watchers.clear(),
  };
}
