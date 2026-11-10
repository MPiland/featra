/**
 * What the user does to a draft from outside the pane's text fields (STORY-50). Send back tells the drafting chat why
 * the draft isn't right, then records that in the feature's history: one server method, so the client never writes
 * history itself. The message goes first, through the chat manager exactly as a typed message does (a busy or failed
 * chat refuses it), and history is written only once the chat has accepted it. Only the send and the history write
 * run in the card lane, so the agent's next revision queues behind them. The message is never sent twice: if the
 * history write fails (tried twice) the send-back still succeeds, saying it wasn't recorded.
 */
import {
  needsReview,
  draftedBy,
  recordSentBack,
  SEND_BACK_MAX,
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
  tooLong: `Keep it under ${SEND_BACK_MAX.toLocaleString("en-US")} characters.`,
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
  /** How a card reaches disk. Default: atomically. */
  write?: (file: string, text: string) => Promise<void>;
}

/** What a send-back answers: `recorded` is false when the chat has the message but the history write failed. */
export interface SendBackResult {
  recorded: boolean;
}

export function createDraftActions({
  scan: scanDir,
  now,
  lane = createCardLane(),
  chats,
  write = writeAtomic,
}: DraftActionDeps) {
  /** The chat that drafted feature `id` in a fresh scan, or why Send back can't be used. */
  async function draftChat(dir: string, id: string): Promise<string> {
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    if (!scan || !found) throw new ApiError(SEND_BACK_MESSAGES.gone);
    const { card } = found.owned;
    const chat = card.type === "feature" && needsReview(card) ? draftedBy(card) : null;
    if (chat === null) throw new ApiError(SEND_BACK_MESSAGES.notDraft(id));
    if (!found.root) throw new ApiError(SEND_BACK_MESSAGES.readOnly);
    if (chats.dirOf(chat) !== dir) throw new ApiError(SEND_BACK_MESSAGES.noChat);
    return chat;
  }

  /** Appends the entry to the owner's copy of `id` as it is now. False when there is nowhere to write it. */
  async function record(dir: string, id: string, reason: string): Promise<boolean> {
    const found = ownedIn(await scanDir(dir), id);
    if (!found?.root) return false;
    const text = serializeCard(recordSentBack(found.owned.card, reason, "user", toIso(now())));
    await write(fileIn(found.root, found.owned.path), text);
    return true;
  }

  async function run(dir: string, id: string, reason: string): Promise<SendBackResult> {
    // Opening a chat can be slow; it doesn't hold the lane.
    await chats.open(await draftChat(dir, id));
    return lane.exclusive(async () => {
      chats.send(await draftChat(dir, id), sendBackMessage(id, reason));
      // The chat has the message; only now does the history say so, onto the card as it is after the send. A failed
      // write is tried once more, and never resends: the message is already there.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return { recorded: await record(dir, id, reason) };
        } catch {
          // Try once more, then report it as not recorded.
        }
      }
      return { recorded: false };
    });
  }

  return {
    /** Sends `reason` to the chat that drafted feature `id`, then records the send-back in its history. */
    sendBack(dir: string, id: string, reason: string): Promise<SendBackResult> {
      const length = reason.trim().length;
      if (!length) return Promise.reject(new ApiError(SEND_BACK_MESSAGES.noReason));
      if (length > SEND_BACK_MAX) return Promise.reject(new ApiError(SEND_BACK_MESSAGES.tooLong));
      return run(dir, id, reason);
    },
  };
}

export type DraftActions = ReturnType<typeof createDraftActions>;
