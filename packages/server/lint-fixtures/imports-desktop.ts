// Lint fixture (STORY-2): deliberately breaks ADR 0015. Linted only by tooling/test/lint-rules.test.ts.
import { registerIpc } from "@featra/desktop/src/ipc.ts";

export const register = registerIpc;
