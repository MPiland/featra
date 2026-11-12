/**
 * What the user does to a story waiting in Acceptance (STORY-23): Accept, and Send back. Both are the user's own
 * action, with no confirmation, so they work from any client, and both write the card's owner copy in the card lane.
 * Accept records Accepted and moves the story to Done when its evidence allows. Send back puts the reason in the
 * story's session as a message first (a busy or failed session refuses it, as for a draft), and only then writes the
 * history, the stage and the optional criterion, so the message is never sent twice: if the write fails (tried twice)
 * the send-back still succeeds, saying it wasn't recorded.
 */
import {
  acceptanceRefusal,
  acceptedStory,
  ACCEPT_MESSAGES,
  SEND_BACK_MAX,
  sendBackMessage,
  sentBackStory,
  serializeCard,
  toIso,
  type Card,
  type ProjectConfig,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { Scan } from "./work-scan.ts";

export interface StoryAcceptanceDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
  chats: Pick<ChatManager, "storySession" | "open" | "send">;
  /** How a card reaches disk. Default: atomically. */
  write?: (file: string, text: string) => Promise<void>;
}

/** What a send-back answers: `recorded` is false when the session has the message but the history write failed. */
export interface StorySendBackResult {
  recorded: boolean;
}

export function createStoryAcceptance({
  scan: scanDir,
  now,
  lane = createCardLane(),
  chats,
  write = writeAtomic,
}: StoryAcceptanceDeps) {
  /** The story as its owner has it now, where to write it, and why Accept and Send back can't be used on it. */
  async function fresh(dir: string, id: string) {
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    const card: Card | undefined = found?.owned.card;
    const config = scan?.collected.config;
    const refusal = config ? acceptanceRefusal(card, id, config) : ACCEPT_MESSAGES.gone;
    if (refusal !== null) throw new ApiError(refusal);
    if (!found?.root || !card || !config) throw new ApiError(ACCEPT_MESSAGES.readOnly);
    return { card, config, file: fileIn(found.root, found.owned.path) };
  }

  /** Writes `change` of the story, read fresh, to its owner copy. The scan after pushes the new rows to the watchers. */
  async function mark(dir: string, id: string, change: (card: Card, config: ProjectConfig) => Card) {
    const { card, config, file } = await fresh(dir, id);
    await write(file, serializeCard(change(card, config)));
    await scanDir(dir);
  }

  return {
    /** Records the user's Accept on story `id`, and moves it to Done when it is also Verified (or needs Accept only). */
    accept: (dir: string, id: string): Promise<null> =>
      lane.exclusive(async () => {
        await mark(dir, id, (card, config) => acceptedStory(card, config, "user", toIso(now())));
        return null;
      }),

    /** Sends `reason` to the session of story `id`, then records the send-back: In Progress, history, the criterion. */
    async sendBack(dir: string, id: string, reason: string, addCriterion: boolean): Promise<StorySendBackResult> {
      const length = reason.trim().length;
      if (!length) throw new ApiError(ACCEPT_MESSAGES.noReason);
      if (length > SEND_BACK_MAX) throw new ApiError(ACCEPT_MESSAGES.tooLong);
      await fresh(dir, id);
      const session = () => {
        const chat = chats.storySession(dir, id);
        if (chat === null) throw new ApiError(ACCEPT_MESSAGES.noSession(id));
        return chat;
      };
      // Opening a session can be slow; it doesn't hold the lane.
      await chats.open(session());
      return lane.exclusive(async () => {
        await fresh(dir, id);
        chats.send(session(), sendBackMessage(id, reason));
        // The session has the message; only now does the card say so. A failed write is tried once more, and never
        // resends: the message is already there.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await mark(dir, id, (card) => sentBackStory(card, reason, addCriterion, "user", toIso(now())));
            return { recorded: true };
          } catch {
            // Try once more, then report it as not recorded.
          }
        }
        return { recorded: false };
      });
    },
  };
}

export type StoryAcceptance = ReturnType<typeof createStoryAcceptance>;
