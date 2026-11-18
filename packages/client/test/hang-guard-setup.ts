/**
 * Testing Library's `waitFor` and `findBy*` give up after a fixed 1 s by default, which a busy PC misses at random
 * (BUG-28). They wait as long as the run's hang guard (`tooling/hang-guard.ts`) instead, so only a hang ends them.
 * Each is noted as an open wait, so a test the hang guard stops names the line that waited (BUG-30). user-event's
 * actions pass through the same wrapper, so they are noted too.
 */
import { configure, getConfig } from "@testing-library/react";
import { inject } from "vitest";
import { waitingFor } from "@featra/tooling/waits";

declare module "vitest" {
  export interface ProvidedContext {
    hangGuardMs: number;
  }
}

const testingLibrary = getConfig();
configure({
  asyncUtilTimeout: inject("hangGuardMs"),
  asyncWrapper: (cb) => waitingFor("a Testing Library wait or user-event action", testingLibrary.asyncWrapper(cb)),
});
