/**
 * Testing Library's `waitFor` and `findBy*` give up after a fixed 1 s by default, which a busy PC misses at random
 * (BUG-28). They wait as long as the run's hang guard (`tooling/hang-guard.ts`) instead, so only a hang ends them.
 */
import { configure } from "@testing-library/react";
import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    hangGuardMs: number;
  }
}

configure({ asyncUtilTimeout: inject("hangGuardMs") });
