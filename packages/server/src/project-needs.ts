/**
 * What every open project needs from the user (STORY-66), kept current: its waiting agents from the requests the Inbox
 * holds (at any wait, so a request answered inline counts as soon as it is asked), and its reviews from its Work list,
 * through the shared per-folder watch (ADR 0016). A project opened or closed meanwhile joins or leaves the list.
 */
import { hasReview, waitingAgents, type InboxItem, type NeedsList } from "@featra/work-format";
import { projectKey, type AllowedProjects } from "./allowed-projects.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { WorkWatches } from "./work-watch.ts";

export interface NeedsDeps {
  allowed: AllowedProjects;
  watches: Pick<WorkWatches, "observe">;
  chats: Pick<ChatManager, "watchInbox">;
  log: (message: string) => void;
  platform?: string;
}

interface Observed {
  review: boolean;
  stop: (() => void) | null;
  /** The project closed, or the watch ended, before its first scan answered. */
  dropped: boolean;
}

/**
 * Starts watching: answers with every open project's needs once each has been scanned, then calls `listener` with the
 * whole list each time it changes. `stop` ends every watch it started.
 */
export async function watchNeeds(
  { allowed, watches, chats, log, platform = process.platform }: NeedsDeps,
  listener: (needs: NeedsList) => void,
): Promise<{ needs: NeedsList; stop: () => void }> {
  const key = (dir: string) => projectKey(dir, platform);
  const observed = new Map<string, Observed>();
  let held: InboxItem[] = [];
  let answered = false;
  let last = "";

  const current = (): NeedsList => {
    return {
      projects: allowed.dirs().map((dir) => ({
        dir,
        waiting: waitingAgents(held.filter((i) => key(i.project ?? "") === key(dir))),
        review: observed.get(dir)?.review ?? false,
      })),
    };
  };
  const changed = () => {
    if (!answered) return;
    const next = current();
    const json = JSON.stringify(next);
    if (json === last) return;
    last = json;
    listener(next);
  };

  const observe = async (dir: string) => {
    const entry: Observed = { review: false, stop: null, dropped: false };
    observed.set(dir, entry);
    try {
      const { value, stop } = await watches.observe(
        dir,
        (_scan, list) => hasReview(list),
        (review) => {
          entry.review = review;
          changed();
        },
      );
      if (entry.dropped) return stop();
      entry.review = value;
      entry.stop = stop;
      changed();
    } catch (err) {
      // A folder that can't be watched has nothing to review; its waiting agents still count.
      log(`needs: can't watch ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const drop = (dir: string, entry: Observed) => {
    entry.dropped = true;
    entry.stop?.();
    observed.delete(dir);
  };
  /** Starts watching each project opened since and stops each one closed. */
  const sync = () => {
    const open = new Set(allowed.dirs());
    for (const [dir, entry] of observed) if (!open.has(dir)) drop(dir, entry);
    return [...open].filter((dir) => !observed.has(dir)).map(observe);
  };

  // Every request held, whatever its wait: a request in its chat stalls its agent as much as one in the Inbox.
  const inbox = chats.watchInbox(null, 0, (next) => {
    held = next.items;
    changed();
  });
  held = inbox.inbox.items;
  const stopAllowed = allowed.onChange(() => {
    void Promise.all(sync());
    changed();
  });
  await Promise.all(sync());
  answered = true;
  const needs = current();
  last = JSON.stringify(needs);
  return {
    needs,
    stop: () => {
      stopAllowed();
      inbox.stop();
      for (const [dir, entry] of observed) drop(dir, entry);
    },
  };
}
