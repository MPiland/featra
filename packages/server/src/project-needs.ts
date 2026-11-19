/**
 * What every open project needs from the user (STORY-66), kept current for every page that watches it. Its waiting
 * agents come from the requests the Inbox holds (at any wait, so a request answered inline counts as soon as it is
 * asked). Its reviews come from its Work list, through the shared per-folder watch (ADR 0016), one per open project,
 * started and stopped with the project list (`watchProjects`). The first watch starts it; it runs until `close`, so a
 * page that reconnects gets the numbers at once, with no new scans.
 */
import { hasReview, waitingAgents, type InboxItem, type NeedsList } from "@featra/work-format";
import { projectKey, type AllowedProjects } from "./allowed-projects.ts";
import type { ChatManager } from "./chat-manager.ts";
import { watchProjects } from "./project-watch.ts";
import type { WorkWatches } from "./work-watch.ts";

export interface NeedsDeps {
  allowed: AllowedProjects;
  watches: Pick<WorkWatches, "observe">;
  chats: Pick<ChatManager, "watchInbox">;
  log: (message: string) => void;
  platform?: string;
}

export interface ProjectNeeds {
  /**
   * Answers with every open project's needs at once, then calls `listener` with the whole list each time it changes.
   * A project's review shows once its first scan has landed; until then it has none.
   */
  watch: (listener: (needs: NeedsList) => void) => { needs: NeedsList; stop: () => void };
  /** Waits for the project watches still starting. */
  ready: () => Promise<void>;
  /** Stops every watch; a page watching after this hears nothing more. */
  close: () => void;
}

/** One project's review mark, from its own watch: a later watch of the same folder has its own. */
interface Review {
  review: boolean;
}

export function createProjectNeeds({
  allowed,
  watches,
  chats,
  log,
  platform = process.platform,
}: NeedsDeps): ProjectNeeds {
  const key = (dir: string) => projectKey(dir, platform);
  const reviews = new Map<string, Review>();
  const listeners = new Set<(needs: NeedsList) => void>();
  let held: InboxItem[] = [];
  let last = "";
  let running: { ready: () => Promise<void>; close: () => void } | null = null;

  const inProject = (item: InboxItem, dir: string) => item.project !== undefined && key(item.project) === key(dir);
  const current = (): NeedsList => ({
    projects: allowed.dirs().map((dir) => ({
      dir,
      waiting: waitingAgents(held.filter((i) => inProject(i, dir))),
      review: reviews.get(dir)?.review ?? false,
    })),
  });
  const changed = () => {
    const next = current();
    const json = JSON.stringify(next);
    if (json === last) return;
    last = json;
    for (const listener of listeners) listener(next);
  };

  /** One project's review watch; its stop forgets the mark, unless a later watch of the folder has taken its place. */
  const startProject = async (dir: string) => {
    const mine: Review = { review: false };
    reviews.set(dir, mine);
    try {
      const { value, stop } = await watches.observe(
        dir,
        (_scan, list) => hasReview(list),
        (review) => {
          mine.review = review;
          changed();
        },
      );
      mine.review = value;
      changed();
      return () => {
        stop();
        if (reviews.get(dir) === mine) reviews.delete(dir);
        changed();
      };
    } catch (err) {
      if (reviews.get(dir) === mine) reviews.delete(dir);
      throw err;
    }
  };

  const start = () => {
    // Every request held, whatever its wait: a request in its chat stalls its agent as much as one in the Inbox.
    const inbox = chats.watchInbox(null, 0, (next) => {
      held = next.items;
      changed();
    });
    held = inbox.inbox.items;
    // A project opened or closed changes the list at once; its review follows when its scan lands.
    const stopAllowed = allowed.onChange(changed);
    // A project whose watch fails is tried again at the next change of the project list.
    const projects = watchProjects(allowed, startProject, log, "Needs");
    last = JSON.stringify(current());
    return {
      ready: () => projects.ready(),
      close: () => {
        stopAllowed();
        inbox.stop();
        projects.close();
        reviews.clear();
      },
    };
  };

  return {
    watch(listener) {
      running ??= start();
      listeners.add(listener);
      return { needs: current(), stop: () => void listeners.delete(listener) };
    },
    ready: () => running?.ready() ?? Promise.resolve(),
    close() {
      // Kept, so `ready` still waits for a project watch that was starting: it stops itself when it has.
      running?.close();
      running ??= { ready: () => Promise.resolve(), close: () => {} };
      listeners.clear();
    },
  };
}
