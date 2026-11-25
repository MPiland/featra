/**
 * The user's own mark on a card (Accept, Send back, a design review's Clear): the card read fresh from its owner, a
 * refusal checked on it, the change written to the owner copy, and a scan so every watcher sees it at once. Run it in
 * the card lane.
 */
import { serializeCard, type Card, type ProjectConfig } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import type { Scan } from "./work-scan.ts";

/** Why the card can't take the mark, or null when it can: `card` is undefined when it is gone. */
export type MarkRefusal = (card: Card | undefined, config: ProjectConfig) => string | null;

/** What a mark says when the project can't be read (`gone`), or the card's owner copy isn't checked out (`readOnly`). */
export interface MarkMessages {
  gone: string;
  readOnly: string;
}

export interface CardMarkDeps {
  scan: (dir: string) => Promise<Scan | null>;
  /** How a card reaches disk. Default: atomically. */
  write?: (file: string, text: string) => Promise<void>;
}

export function createCardMark({ scan, write = writeAtomic }: CardMarkDeps) {
  /** Card `id` as its owner has it now, its project's config and the file to write; throws what refuses it. */
  async function fresh(dir: string, id: string, refusal: MarkRefusal, messages: MarkMessages) {
    const scanned = await scan(dir);
    const found = ownedIn(scanned, id);
    const card = found?.owned.card;
    const config = scanned?.collected.config;
    const why = config ? refusal(card, config) : messages.gone;
    if (why !== null) throw new ApiError(why);
    if (!found?.root || !card || !config) throw new ApiError(messages.readOnly);
    return { card, config, file: fileIn(found.root, found.owned.path) };
  }

  return {
    fresh,
    /** Writes `change` of card `id`, read fresh, to its owner copy, and scans again. */
    async mark(
      dir: string,
      id: string,
      refusal: MarkRefusal,
      messages: MarkMessages,
      change: (card: Card, config: ProjectConfig) => Card,
    ): Promise<void> {
      const { card, config, file } = await fresh(dir, id, refusal, messages);
      await write(file, serializeCard(change(card, config)));
      await scan(dir);
    },
  };
}

export type CardMark = ReturnType<typeof createCardMark>;
