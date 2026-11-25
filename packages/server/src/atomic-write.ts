/**
 * A file written whole or not at all (ADR 0017): the text goes to a temporary file in the same folder, then a rename
 * replaces the file, so no reader sees half of it. The temporary name starts with a dot and ends `.featra-tmp`, so a
 * crash's leftover is never read as a card or as the config. Kept apart from the card actions so the config writer
 * can use it without them.
 */
import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { retryBusy } from "./busy-retry.ts";

export interface AtomicIo {
  rename?: typeof rename;
  pause?: (ms: number) => Promise<unknown>;
}

/** The temporary file `writeAtomic` writes before it replaces `file`. */
export const tempFor = (file: string) => join(dirname(file), `.${randomBytes(6).toString("hex")}.featra-tmp`);

/**
 * Writes `text` to `file` through a temporary file in the same folder. A rename that Windows refuses because a scan
 * or a scanner has the file open is tried again a few times (BUG-16).
 */
export async function writeAtomic(file: string, text: string, { rename: move = rename, pause }: AtomicIo = {}) {
  const temp = tempFor(file);
  try {
    await writeFile(temp, text, "utf8");
    await retryBusy(() => move(temp, file), pause);
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}
