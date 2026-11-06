// Lint fixture (STORY-41): the imports the client may use. Linted only by tooling/test/lint-rules.test.ts.
import { isRecord } from "@featra/work-format";
import { useState } from "react";

export function Toggle() {
  const [on, setOn] = useState(false);
  return (
    <button type="button" aria-pressed={on} onClick={() => setOn(isRecord({}) && !on)}>
      Toggle
    </button>
  );
}
