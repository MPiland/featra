/**
 * Telling a session why a card was sent back, then recording it (STORY-50 for a draft, STORY-23 for a story). The
 * message goes first, through the chat manager exactly as a typed message does (a busy or failed chat refuses it), and
 * the card's history is written only once the chat has accepted it. Only the send and the write run in the card lane,
 * so the agent's next revision queues behind them. The message is never sent twice: a failed write is tried once more
 * and then reported as not recorded, still a success, since the chat has the message.
 */
import type { CardLane } from "./card-lane.ts";

/** What a send-back answers: `recorded` is false when the chat has the message but the history write failed. */
export interface SendBackResult {
  recorded: boolean;
}

export interface SendThenRecord {
  lane: CardLane;
  /** Opens the chat, if it needs it. It can be slow, so it doesn't hold the lane. Throws when it can't be used. */
  open: () => Promise<void>;
  /** Sends the message, inside the lane, on the card as it is now. Throws when the chat refuses it. */
  send: () => void | Promise<void>;
  /** Records the send-back on the card as it is after the send; false when there is nowhere to write it. */
  record: () => Promise<boolean>;
}

export async function sendThenRecord({ lane, open, send, record }: SendThenRecord): Promise<SendBackResult> {
  await open();
  return lane.exclusive(async () => {
    await send();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { recorded: await record() };
      } catch {
        // Try once more, then report it as not recorded.
      }
    }
    return { recorded: false };
  });
}
