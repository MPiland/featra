// Lint fixture (STORY-41): deliberately breaks ADR 0011. Linted only by tooling/test/lint-rules.test.ts.
import { readFileSync } from "node:fs";

export const read = readFileSync;
