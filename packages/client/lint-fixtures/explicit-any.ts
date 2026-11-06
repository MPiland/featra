// Lint fixture (STORY-41): deliberately breaks a TypeScript rule. Linted only by tooling/test/lint-rules.test.ts.
export const parse = (text: string): any => JSON.parse(text);
