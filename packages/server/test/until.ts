import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    /** The run's hang guard, in ms (`tooling/hang-guard.ts`). */
    hangGuardMs: number;
  }
}

/** Waits until a condition holds, with no deadline of its own; a hung wait is named at the hang guard (BUG-30). */
export { until } from "@featra/tooling/waits";

/**
 * How long a test lets a check command it starts run: the run's hang guard, which the project's config provides. A
 * fixed 30 s killed node starts that the load had stalled (BUG-28).
 */
export const TEST_PROCESS_LIMIT_MS = inject("hangGuardMs");
