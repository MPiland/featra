// Lint fixture (STORY-41): deliberately breaks ADR 0011. Linted only by tooling/test/lint-rules.test.ts.
import { registerIpc } from "@featra/desktop/src/ipc.ts";

export const register = registerIpc;
