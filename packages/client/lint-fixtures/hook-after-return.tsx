// Lint fixture (STORY-41): deliberately breaks a React Hooks rule. Linted only by tooling/test/lint-rules.test.ts.
import { useState } from "react";

export function Counter({ show }: { show: boolean }) {
  if (!show) return null;
  const [count] = useState(0);
  return <p>{count}</p>;
}
