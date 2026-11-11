/**
 * Stopping and resuming a story's agent (STORY-53, ADR 0026). Stop ends the session's running turn (or drops one that
 * waits for a slot) and marks the story's card Stopped with a history event; Resume goes on in the same provider
 * session and clears the mark. The card is the owner's copy, written like every card write, through the lane; its
 * stage, worktree and changes are untouched. The user's own action, with no confirmation, so it works from any client.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  CHAT_MESSAGES,
  resumedStory,
  resumeRefusal,
  serializeCard,
  STOP_MESSAGES,
  stopRefusal,
  stoppedStory,
  toIso,
  type Card,
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
  chats: Pick<ChatManager, "storySession" | "list" | "stop" | "resume">;
}

export function createStoryStop({ scan: scanDir, now, lane = createCardLane(), chats }: StoryStopDeps) {
  /** The story's card as its owner has it, and where to write it. */
  async function cardOf(dir: string, id: string) {
    const found = ownedIn(await scanDir(dir), id);
    return { card: found?.owned.card, file: found?.root ? fileIn(found.root, found.owned.path) : null };
  }

  /** The story's session, or why there is none. */
  function sessionOf(dir: string, id: string): string {
    const chat = chats.storySession(dir, id);
    if (chat === null) throw new ApiError(CHAT_MESSAGES.noSession);
    return chat;
  }

  /** Writes `change` of the card, read fresh, to its owner copy. */
  async function mark(dir: string, id: string, change: (card: Card) => Card) {
    const { card, file } = await cardOf(dir, id);
    if (!card || !file) throw new ApiError(STOP_MESSAGES.gone);
    await mkdir(dirname(file), { recursive: true });
    await writeAtomic(file, serializeCard(change(card)));
    // The scan after the write pushes the new row to every watcher.
    await scanDir(dir);
  }

  return {
    async stop(dir: string, id: string): Promise<null> {
      await lane.exclusive(async () => {
        const refusal = stopRefusal((await cardOf(dir, id)).card);
        if (refusal !== null) throw new ApiError(refusal);
        const chat = sessionOf(dir, id);
        if (!chats.list(dir).find((c) => c.id === chat)?.running) throw new ApiError(STOP_MESSAGES.idle(id));
        await chats.stop(chat);
        await mark(dir, id, (card) => stoppedStory(card, "user", toIso(now())));
      });
      return null;
    },
    async resume(dir: string, id: string): Promise<null> {
      await lane.exclusive(async () => {
        const refusal = resumeRefusal((await cardOf(dir, id)).card);
        if (refusal !== null) throw new ApiError(refusal);
        await chats.resume(sessionOf(dir, id));
        await mark(dir, id, (card) => resumedStory(card, "user", toIso(now())));
      });
      return null;
    },
  };
}

export type StoryStop = ReturnType<typeof createStoryStop>;
