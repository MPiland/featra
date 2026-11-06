// Lint fixture (STORY-41): deliberately breaks a jsx-a11y rule. Linted only by tooling/test/lint-rules.test.ts.
export function Logo() {
  return <img src="logo.png" />;
}
