// Lint fixture (STORY-41): deliberately breaks ADR 0011. Linted only by tooling/test/lint-rules.test.ts.
import { readFile } from "fs/promises";

export const read = readFile;
