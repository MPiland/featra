/**
 * JUnit XML reports (STORY-56; STORY-57 reads CI's reports with the same parser). A test runner writes one `testcase`
 * per test, with a `failure`, `error` or `skipped` child when it did not pass. What a linked test proves is decided
 * here, from the report, never from a command's exit code (ADR 0004). Pure.
 */
import type { TestRef } from "./check-commands.ts";

export type CaseStatus = "passed" | "failed" | "skipped";

/** One test as the report lists it. */
export interface JUnitCase {
  /** The test's name as the runner printed it, describe names and its own joined by spaces. */
  name: string;
  /** The runner's group for it: usually the test file. */
  classname: string;
  status: CaseStatus;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (text: string) =>
  text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (all, dec?: string, hex?: string, named?: string) => {
    if (named) return ENTITIES[named.toLowerCase()] ?? all;
    const code = dec ? Number(dec) : Number.parseInt(hex ?? "", 16);
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });

const attr = (attrs: string, name: string) => {
  const m = new RegExp(String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return decode(m?.[1] ?? m?.[2] ?? "");
};

/** A tag, with quoted attribute values that may hold `>`. */
const TAG = /<(\/?)(testcase|failure|error|skipped)\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

/** The names a runner prints as `describe > test` read as the words joined by single spaces. */
export const fullName = (name: string) =>
  name
    .split(/\s+>\s+/)
    .join(" ")
    .trim();

/** The tests in a JUnit report, in order. Anything that isn't a report gives none. */
export function parseJUnit(xml: string): JUnitCase[] {
  const text = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const cases: JUnitCase[] = [];
  let current: JUnitCase | null = null;
  for (const [, closing, tag, attrs, selfClosing] of text.matchAll(TAG)) {
    if (tag === "testcase") {
      if (closing) {
        current = null;
        continue;
      }
      current = {
        name: fullName(attr(attrs ?? "", "name")),
        classname: attr(attrs ?? "", "classname"),
        status: "passed",
      };
      cases.push(current);
      if (selfClosing) current = null;
    } else if (current && !closing) {
      if (tag === "skipped") current.status = current.status === "passed" ? "skipped" : current.status;
      else current.status = "failed";
    }
  }
  return cases;
}

/** What a report says of one linked test; one not proven is `missing` when it didn't run (absent or skipped). */
export type ProofResult = { proven: true } | { proven: false; reason: string; missing: boolean };

/**
 * Whether `report` proves `ref`: it must hold a test whose full name equals the linked name, with no failure, error or
 * skip. A name that matches nothing, or is only part of another test's name, proves nothing. A link without a name
 * names the whole file: the report must hold tests and every one must have passed.
 */
export function proofFromReport(report: readonly JUnitCase[], ref: TestRef): ProofResult {
  if (ref.name === null) {
    if (report.length === 0) return { proven: false, reason: "The report has no tests.", missing: true };
    const bad = worst(report);
    return bad ? notPassed(bad.name, bad.status) : { proven: true };
  }
  const name = fullName(ref.name);
  const found = report.filter((c) => c.name === name);
  if (found.length === 0) return { proven: false, reason: `No test named "${ref.name}" ran.`, missing: true };
  const bad = worst(found);
  return bad ? notPassed(ref.name, bad.status) : { proven: true };
}

/** The first failed test, else the first skipped one; undefined when every one passed. */
const worst = (cases: readonly JUnitCase[]) =>
  cases.find((c) => c.status === "failed") ?? cases.find((c) => c.status !== "passed");

const notPassed = (name: string, status: CaseStatus): ProofResult =>
  status === "failed"
    ? { proven: false, reason: `"${name}" failed.`, missing: false }
    : { proven: false, reason: `"${name}" was skipped.`, missing: true };
