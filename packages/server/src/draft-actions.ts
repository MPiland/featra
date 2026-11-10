/**
 * What the user does to a draft from outside the pane's text fields (STORY-50). Send back tells the drafting chat why
 * the draft isn't right, then records that in the feature's history: one server method, so the client never writes
 * history itself. The message goes first, through the chat manager exactly as a typed message does (a busy or failed
 * chat refuses it), and history is written only once the chat has accepted it. It runs in the card lane, so the
 * agent's next revision queues behind the history write.
 */
import {
  errorMessage,
  needsReview,
  draftedBy,
  recordSentBack,
  sendBackMessage,
  serializeCard,
  toIso,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { Scan } from "./work-scan.ts";

export const SEND_BACK_MESSAGES = {
  noReason: "Say why you're sending it back.",
  gone: "That card is gone.",
  notDraft: (id: string) => `${id} isn't a draft.`,
  noChat: "The chat that drafted it is gone.",
  readOnly: "Can't edit it here.",
} as const;

export interface DraftActionDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
  chats: Pick<ChatManager, "dirOf" | "open" | "send">;
}

export function createDraftActions({ scan: scanDir, now, lane = createCardLane(), chats }: DraftActionDeps) {
  async function run(dir: string, id: string, reason: string): Promise<null> {
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    if (!scan || !found) throw new ApiError(SEND_BACK_MESSAGES.gone);
    const { card } = found.owned;
    const chat = card.type === "feature" && needsReview(card) ? draftedBy(card) : null;
    if (chat === null) throw new ApiError(SEND_BACK_MESSAGES.notDraft(id));
    if (!found.root) throw new ApiError(SEND_BACK_MESSAGES.readOnly);
    if (chats.dirOf(chat) !== dir) throw new ApiError(SEND_BACK_MESSAGES.noChat);
    await chats.open(chat);
    chats.send(chat, sendBackMessage(id, reason));
    // The chat has the message; only now does the history say so.
    try {
      await writeAtomic(
        fileIn(found.root, found.owned.path),
        serializeCard(recordSentBack(card, reason, "user", toIso(now()))),
      );
    } catch (err) {
      throw new ApiError(`Sent, but can't record it: ${errorMessage(err)}`);
    }
    await scanDir(dir);
    return null;
  }

  return {
    /** Sends `reason` to the chat that drafted feature `id`, then records the send-back in its history. */
    sendBack(dir: string, id: string, reason: string): Promise<null> {
      if (!reason.trim()) return Promise.reject(new ApiError(SEND_BACK_MESSAGES.noReason));
      return lane.exclusive(() => run(dir, id, reason));
    },
  };
}

export type DraftActions = ReturnType<typeof createDraftActions>;
