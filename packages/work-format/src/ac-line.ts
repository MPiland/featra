/**
 * One acceptance criterion's line in a card: `- [x] text (test: <ref>) (page: <route>) (evidence: <path>)`, each
 * reference optional and in that order. `page` is the route the story's agent listed for Featra to capture (STORY-25).
 */
import type { AcceptanceCriterion, ChecklistItem } from "./types.ts";

// A test ref may hold balanced parentheses, one deep, as test names do ("Accept (AC1) > ..."; BUG-20).
const AC_REFS =
  /^(.*?)(?:\s*\(test: ((?:[^()]|\([^()]*\))+)\))?(?:\s*\(page: ([^()\s]+)\))?(?:\s*\(evidence: ([^)]+)\))?\s*$/;

/** Splits an AC's trailing references off its text. */
export function parseAcLine(item: ChecklistItem): AcceptanceCriterion {
  const [, text, test, page, evidence] = AC_REFS.exec(item.text) ?? [];
  if (text === undefined || (!test && !page && !evidence)) return { ...item, test: null };
  return {
    ...item,
    text,
    test: test?.trim() || null,
    ...(page ? { page } : {}),
    ...(evidence?.trim() ? { evidence: evidence.trim() } : {}),
  };
}

/** The AC as its card line. */
export function formatAcLine(ac: AcceptanceCriterion): string {
  const refs = [
    ac.test ? ` (test: ${ac.test})` : "",
    ac.page ? ` (page: ${ac.page})` : "",
    ac.evidence ? ` (evidence: ${ac.evidence})` : "",
  ];
  return `- [${ac.done ? "x" : " "}] ${ac.text}${refs.join("")}`;
}
