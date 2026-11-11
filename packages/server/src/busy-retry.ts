/**
 * Windows holds a file briefly while a virus scanner, an indexer or a scan of our own has it open: replacing it then
 * fails with EPERM or EBUSY, and passes a moment later (BUG-16). One place says which errors and how many tries.
 */
import { setTimeout as delay } from "node:timers/promises";
import { isRecord } from "@featra/work-format";

export const BUSY_TRIES = 5;

/** Whether `err` says the file is held by another program. */
export const isBusy = (err: unknown): boolean => isRecord(err) && (err.code === "EPERM" || err.code === "EBUSY");

/** Runs `job`, again after a short pause while it fails as busy; the last busy error is thrown after `BUSY_TRIES`. */
export async function retryBusy<T>(job: () => Promise<T>, pause: (ms: number) => Promise<unknown> = delay): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await job();
    } catch (err) {
      if (!isBusy(err) || attempt >= BUSY_TRIES) throw err;
      await pause(25 * attempt);
    }
  }
}
