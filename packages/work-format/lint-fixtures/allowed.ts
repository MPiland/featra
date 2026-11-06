// Lint fixture (STORY-41): the imports work-format may use. Linted only by tooling/test/lint-rules.test.ts.
import { parse } from "yaml";

export const read = (text: string): unknown => parse(text);
