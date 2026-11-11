/**
 * Stopping and resuming a story's agent (STORY-53, ADR 0026). Stop marks the story's card Stopped with a history
 * event and then interrupts the session's running turn (or drops a turn that waits for a slot); a story still queued,
 * never started, just leaves the queue. Resume checks everything first, clears the mark, then sends the session's next
 * turn in the same provider session; it also goes on in an In Progress session whose last turn did not finish. The card
 * is written first and the lane is not held across the interrupt, so a failure never leaves a running agent with no
 * Resume. The user's own action, with no confirmation, so it works from any client.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  CHAT_MESSAGES,
  leftQueue,
  resumedStory,
  resumeRefusal,
  serializeCard,
  stageTone,
  STOP_MESSAGES,
  stopRefusal,
  stoppedIn,
  stoppedStory,
  toIso,
  type Card,
  type StoryTurn,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { Scan } from "./work-scan.ts";

export interface StoryStopDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  lane?: CardLane;
  chats: Pick<ChatManager, "storySession" | "list" | "stop" | "resume" | "dropQueued">;
  /** How long Stop waits for the provider to end the turn before it answers; the turn ends on its own after that. */
  interruptMs?: number;
}

/** `work` settled, or `ms` passed. A failure of `work` before then is thrown; one after is left unheard. */
async function within(work: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  work.catch(() => {});
  try {
    await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

export function createStoryStop({
  scan: scanDir,
  now,
  lane = createCardLane(),
  chats,
  interruptMs = 10_000,
}: StoryStopDeps) {
  /** The story's card as its owner has it, where to write it, and the tone of its stage. */
  async function cardOf(dir: string, id: string) {
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    const card = found?.owned.card;
    return {
      card,
      file: found?.root ? fileIn(found.root, found.owned.path) : null,
      tone: card && scan ? stageTone(card.status, scan.collected.config) : ("idle" as const),
    };
  }

  /** What the session's row says of its turn. */
  function turnOf(dir: string, chat: string | null): StoryTurn {
    const row = chat === null ? undefined : chats.list(dir).find((c) => c.id === chat);
    return { running: row?.running === true, queued: row?.queued === true, stalled: row?.stalled === true };
  }

  /** Writes `change` of the card, read fresh, to its owner copy, in the lane. */
  const mark = (dir: string, id: string, change: (card: Card) => Card) =>
    lane.exclusive(async () => {
      const { card, file } = await cardOf(dir, id);
      if (!card || !file) throw new ApiError(STOP_MESSAGES.gone);
      await mkdir(dirname(file), { recursive: true });
      await writeAtomic(file, serializeCard(change(card)));
      // The scan after the write pushes the new row to every watcher.
      await scanDir(dir);
    });

  return {
    async stop(dir: string, id: string): Promise<null> {
      const { card, file, tone } = await cardOf(dir, id);
      const chat = chats.storySession(dir, id);
      const turn = turnOf(dir, chat);
      // A story still waiting for a slot has no agent: it leaves the queue, and its card keeps its stage, unmarked.
      if (chat !== null && card?.type === "story" && card.agent === null && turn.queued) {
        if (!chats.dropQueued(chat)) throw new ApiError(STOP_MESSAGES.idle(id));
        // The card only gets its event where its owner copy is writable: a story queued under a started feature has its
        // card on the feature branch, which nobody has checked out, and nothing about the story changed.
        if (file) await mark(dir, id, (c) => leftQueue(c, "user", toIso(now())));
        return null;
      }
      // A stop asked again while the turn still runs only interrupts again.
      const again = card !== undefined && stoppedIn(card, tone) && turn.running;
      const refusal = again ? null : stopRefusal(card, tone);
      if (refusal !== null) throw new ApiError(refusal);
      if (chat === null) throw new ApiError(CHAT_MESSAGES.noSession);
      if (!turn.running && !turn.queued) throw new ApiError(STOP_MESSAGES.idle(id));
      // The mark first: whatever fails after it leaves the story Stopped, with Resume to go on from.
      if (!again) await mark(dir, id, (c) => stoppedStory(c, "user", toIso(now())));
      await within(chats.stop(chat), interruptMs);
      return null;
    },
    async resume(dir: string, id: string): Promise<null> {
      const { card, tone } = await cardOf(dir, id);
      const chat = chats.storySession(dir, id);
      const refusal = resumeRefusal(card, tone, turnOf(dir, chat));
      if (refusal !== null) throw new ApiError(refusal);
      if (chat === null) throw new ApiError(CHAT_MESSAGES.noSession);
      const stopped = card !== undefined && stoppedIn(card, tone);
      // The session's own checks come first; then the mark is cleared; then the turn is sent.
      await chats.resume(chat, async () => {
        if (stopped) await mark(dir, id, (c) => resumedStory(c, "user", toIso(now())));
      });
      return null;
    },
  };
}

export type StoryStop = ReturnType<typeof createStoryStop>;
