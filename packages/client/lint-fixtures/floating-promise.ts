// Lint fixture (STORY-41): deliberately breaks a type-aware rule. Linted only by tooling/test/lint-rules.test.ts.
const save = async (): Promise<void> => {};

export function onClick() {
  save();
}
