/**
 * The stories being ended now (STORY-12, STORY-58): merged into their feature or abandoned. Their session is about to
 * end, so it takes no message, Send back or Resume meanwhile, and one ending refuses the other.
 */
import { ABANDON_MESSAGES, MERGE_MESSAGES } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { keyOf } from "./story-prs-seen.ts";

export type Ending = "merge" | "abandon";

/** What a message, Send back or Resume is told while the story ends this way. */
const busyMessage = (kind: Ending, id: string) =>
  kind === "merge" ? MERGE_MESSAGES.busy(id) : ABANDON_MESSAGES.busy(id);

/** What a second ending of the same kind is told while one runs. */
const runningMessage = (kind: Ending, id: string) =>
  kind === "merge" ? MERGE_MESSAGES.merging(id) : ABANDON_MESSAGES.abandoning(id);

export function createStoryEnding() {
  const ending = new Map<string, Ending>();

  /** Runs `work` as story `id`'s `kind` of ending; refused while another ending of it runs. */
  async function hold<T>(dir: string, id: string, kind: Ending, work: () => Promise<T>): Promise<T> {
    const key = keyOf(dir, id);
    const running = ending.get(key);
    if (running !== undefined) {
      throw new ApiError(running === kind ? runningMessage(kind, id) : busyMessage(running, id));
    }
    ending.set(key, kind);
    try {
      return await work();
    } finally {
      ending.delete(key);
    }
  }

  /** How story `id` is ending now, or null when it isn't. */
  const endingOf = (dir: string, id: string): Ending | null => ending.get(keyOf(dir, id)) ?? null;

  /** Why story `id`'s session takes no message, Send back or Resume now; null when it does. */
  const busy = (dir: string, id: string): string | null => {
    const kind = endingOf(dir, id);
    return kind === null ? null : busyMessage(kind, id);
  };

  return { hold, endingOf, busy };
}

export type StoryEnding = ReturnType<typeof createStoryEnding>;
