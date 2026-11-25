/**
 * What the user does to a story waiting in Acceptance (STORY-23): Accept, and Send back, which also works on a story
 * waiting in review for its design review (STORY-73). Both are the user's own
 * action, with no confirmation, so they work from any client, and both write the card's owner copy in the card lane.
 * Accept records Accepted and moves the story to Done when its evidence allows. Send back puts the reason in the
 * story's session as a message first and only then writes the history, the stage and the optional criterion, as for a
 * draft (send-then-record.ts).
 */
import {
  acceptanceRefusal,
  sendBackRefusal,
  acceptedStory,
  ACCEPT_MESSAGES,
  SEND_BACK_MAX,
  sendBackMessage,
  sentBackStory,
  toIso,
  type Card,
  type ProjectConfig,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { writeAtomic } from "./card-actions.ts";
import { createCardMark } from "./card-mark.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import { sendThenRecord, type SendBackResult } from "./send-then-record.ts";
import type { Scan } from "./work-scan.ts";

export interface StoryAcceptanceDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
  chats: Pick<ChatManager, "storySession" | "open" | "send">;
  /** How a card reaches disk. Default: atomically. */
  write?: (file: string, text: string) => Promise<void>;
  /** Why the story takes no Send back now (STORY-12, STORY-58): it is merging or being abandoned, so its session is about to end. Null when it does. */
  busy?: (dir: string, id: string) => string | null;
}

export function createStoryAcceptance({
  scan: scanDir,
  now,
  lane = createCardLane(),
  chats,
  write = writeAtomic,
  busy = () => null,
}: StoryAcceptanceDeps) {
  const marks = createCardMark({ scan: scanDir, write });
  const MESSAGES = { gone: ACCEPT_MESSAGES.gone, readOnly: ACCEPT_MESSAGES.readOnly };

  /** The story as its owner has it now, where to write it, and why Accept and Send back can't be used on it. */
  const fresh = (dir: string, id: string, refusalOf = acceptanceRefusal) =>
    marks.fresh(dir, id, (card, config) => refusalOf(card, id, config), MESSAGES);

  /** Writes `change` of the story, read fresh, to its owner copy. The scan after pushes the new rows to the watchers. */
  const mark = (
    dir: string,
    id: string,
    change: (card: Card, config: ProjectConfig) => Card,
    refusalOf = acceptanceRefusal,
  ) => marks.mark(dir, id, (card, config) => refusalOf(card, id, config), MESSAGES, change);

  return {
    /** Records the user's Accept on story `id`, and moves it to Done when it is also Verified (or needs Accept only). */
    accept: (dir: string, id: string): Promise<null> =>
      lane.exclusive(async () => {
        await mark(dir, id, (card, config) => acceptedStory(card, config, "user", toIso(now())));
        return null;
      }),

    /** Sends `reason` to the session of story `id`, then records the send-back: In Progress, history, the criterion. */
    async sendBack(dir: string, id: string, reason: string, addCriterion: boolean): Promise<SendBackResult> {
      const length = reason.trim().length;
      if (!length) throw new ApiError(ACCEPT_MESSAGES.noReason);
      if (length > SEND_BACK_MAX) throw new ApiError(ACCEPT_MESSAGES.tooLong);
      await fresh(dir, id, sendBackRefusal);
      const session = () => {
        const chat = chats.storySession(dir, id);
        if (chat === null) throw new ApiError(ACCEPT_MESSAGES.noSession(id));
        return chat;
      };
      return sendThenRecord({
        lane,
        open: async () => chats.open(session()),
        send: async () => {
          await fresh(dir, id, sendBackRefusal);
          const ending = busy(dir, id);
          if (ending !== null) throw new ApiError(ending);
          chats.send(session(), sendBackMessage(id, reason));
        },
        record: async () => {
          await mark(
            dir,
            id,
            (card, config) => sentBackStory(card, config, reason, addCriterion, "user", toIso(now())),
            sendBackRefusal,
          );
          return true;
        },
      });
    },
  };
}

export type StoryAcceptance = ReturnType<typeof createStoryAcceptance>;
