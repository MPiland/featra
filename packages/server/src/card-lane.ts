/**
 * The one lane every write of a card goes through (STORY-8 review, ADR 0002): a draft that allocates IDs and a card
 * edit never interleave, so each reads the cards, decides and writes before the next reads. A second app instance on
 * the same project is not covered (decisions.md); the exclusive create below is what keeps it from overwriting a card.
 */
import { randomBytes } from "node:crypto";
import { link, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface CardLane {
  /** Runs `job` once every job before it has finished, whether those succeeded or not. */
  exclusive: <T>(job: () => Promise<T>) => Promise<T>;
}

export function createCardLane(): CardLane {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    exclusive(job) {
      const turn = tail.then(job);
      tail = turn.catch(() => undefined);
      return turn;
    },
  };
}

/** Whether `err` says the file was already there. */
export const isCollision = (err: unknown): boolean =>
  typeof err === "object" && err !== null && "code" in err && err.code === "EEXIST";

/**
 * Creates `file` with `text`, and fails with a collision (`isCollision`) when it exists: the text goes to a temporary
 * file first and is hard-linked into place, so no reader sees half a card and an existing file is never replaced.
 */
export async function createExclusive(file: string, text: string): Promise<void> {
  const temp = join(dirname(file), `.${randomBytes(6).toString("hex")}.featra-tmp`);
  try {
    await writeFile(temp, text, "utf8");
    await link(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}
