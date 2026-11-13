/**
 * Proven from CI (STORY-57): pure rules. When a project's checks run in CI, the JUnit reports CI uploads for a PR's
 * head commit prove its story's criteria (ADR 0004), by the same rule as a local run: a test proves its criterion only
 * when the report has a passed test whose full name equals the linked name. Several reports (one per job, say) are
 * read as one, where a test passed only when it passed in one and failed in none. A linked test is looked up in its own
 * file, and whatever the report holds counts, end-to-end tests included.
 */
import { parseTestRefs, type TestRef } from "./check-commands.ts";
import type { CheckOutcome } from "./checks.ts";
import { proofFromReport, type CaseStatus, type JUnitCase, type ProofResult } from "./junit.ts";
import type { CiProof } from "./prs-types.ts";
import type { Card } from "./types.ts";

export const CI_PROOF_COPY = {
  noRuns: "No CI runs for this commit, so there is no test report.",
  noReport: "CI uploaded no test report matching Project settings.",
  tooLarge: "Part of the test report was too large to read. Tests in that part count as missing.",
  noFile: (file: string) => `No test from ${file} ran.`,
  ambiguous: (file: string) => `The report can't tell ${file} from another file.`,
} as const;

/** A path with `/` separators and no leading `./`. */
const norm = (path: string) => path.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");

/**
 * Whether a report's `classname` is the test file `file` (a path from the repository's root): the same path, a path
 * from a package folder inside the repository, or a longer path that ends with it.
 */
export function sameFile(classname: string, file: string): boolean {
  const a = norm(classname);
  const b = norm(file);
  if (!a || !b) return false;
  return a === b || b.endsWith(`/${a}`) || a.endsWith(`/${b}`);
}

const RANK: Record<CaseStatus, number> = { skipped: 0, passed: 1, failed: 2 };

/**
 * Several reports read as one, after each test's path is resolved to the linked file it is. The same test (file and full name) in more than one keeps its worst result: a failure
 * anywhere fails it, and a test skipped in one report but passed in another passed.
 */
export function mergeReports(reports: readonly (readonly JUnitCase[])[]): JUnitCase[] {
  const merged = new Map<string, JUnitCase>();
  for (const test of reports.flat()) {
    const key = `${norm(test.classname)}\0${test.name}`;
    const was = merged.get(key);
    merged.set(key, was && RANK[was.status] >= RANK[test.status] ? was : test);
  }
  return [...merged.values()];
}

/** Whether `classname` is `file` only by being a shorter path that `file` ends with, so it may be another file. */
const shorter = (classname: string, file: string) =>
  norm(classname) !== norm(file) && norm(file).endsWith(`/${norm(classname)}`);

/**
 * The report's tests of the linked file `file`, read as one file whatever path each report gave it. A path that is the
 * file, or longer, is trusted; a shorter one counts only when nothing else could be meant: no full path matched, it is
 * the only shorter path that did, and no other file the card links ends with it. Null when it's ambiguous.
 */
function testsOf(cases: readonly JUnitCase[], file: string, linked: readonly string[]): JUnitCase[] | null {
  const matched = cases.filter((c) => sameFile(c.classname, file));
  const full = matched.filter((c) => !shorter(c.classname, file));
  if (full.length === 0 && matched.length > 0) {
    const paths = new Set(matched.map((c) => norm(c.classname)));
    const [path = ""] = paths;
    const others = linked.filter((f) => norm(f) !== norm(file));
    if (paths.size > 1 || others.some((f) => sameFile(path, f))) return null;
  }
  return mergeReports([
    (full.length > 0 ? full : matched).map(({ name, status }) => ({ classname: file, name, status })),
  ]);
}

/** What the reports say of one linked test, looked up in its own file; `linked` is every file the card links. */
export function ciProofOf(
  cases: readonly JUnitCase[],
  ref: TestRef,
  linked: readonly string[] = [ref.file],
): ProofResult {
  const inFile = testsOf(cases, ref.file, linked);
  if (inFile === null) return { proven: false, reason: CI_PROOF_COPY.ambiguous(ref.file), missing: true };
  if (ref.name === null && inFile.length === 0)
    return { proven: false, reason: CI_PROOF_COPY.noFile(ref.file), missing: true };
  return proofFromReport(inFile, ref);
}

/** Each linked criterion's evidence from the reports, and what the card says of those not proven. */
export interface CiProofResult {
  acs: CheckOutcome["acs"][number][];
  proof: CiProof;
}

/**
 * The criteria of `card` that link tests, each proven when every test it links passed, else not; one whose test failed
 * is said to have failed, else one whose test isn't in the report is said to be missing, with why. A criterion that
 * links no test is left out, so it stays as it was. `note` is why there was no report to read, when there wasn't.
 */
export function ciProof(card: Card, cases: readonly JUnitCase[], note: string | null = null): CiProofResult {
  const acs: CiProofResult["acs"] = [];
  const proof: CiProof = { failedAcs: [], missingAcs: [], reasons: [], note };
  const linked = card.acs.flatMap((criterion) => parseTestRefs(criterion.test).map((ref) => ref.file));
  card.acs.forEach((criterion, i) => {
    const refs = parseTestRefs(criterion.test);
    if (refs.length === 0) return;
    const ac = i + 1;
    const not = refs.map((ref) => ciProofOf(cases, ref, linked)).filter((p) => !p.proven);
    acs.push({ ac, passed: not.length === 0 });
    if (not.length === 0) return;
    (not.some((p) => !p.missing) ? proof.failedAcs : proof.missingAcs).push(ac);
    proof.reasons.push(`AC ${ac}: ${not.map((p) => p.reason).join(" ")}`);
  });
  return { acs, proof };
}

/** Every criterion of `card` that links a test, not proven: all CI's proof says once the PR's head has moved. */
export function unprovenLinked(card: Card): CheckOutcome {
  const acs = card.acs.flatMap((criterion, i) => (parseTestRefs(criterion.test).length > 0 ? [i + 1] : []));
  return { passed: null, acs: acs.map((ac) => ({ ac, passed: false })) };
}

const escapeRegExp = (text: string) => text.replace(/[.+^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * Whether `path` (inside the artifact, `/` separated) is one of the report files `glob` names: `**` any folders, `*`
 * any characters but `/`, `?` one. No glob: every `.xml` file.
 */
export function isReportFile(glob: string | null, path: string): boolean {
  const file = norm(path);
  if (glob === null) return /\.xml$/i.test(file);
  const pattern = glob
    .split("/")
    .map((part) =>
      part === "**" ? "(?:.*/)?" : `${escapeRegExp(part).replaceAll("*", "[^/]*").replaceAll("?", "[^/]")}/`,
    )
    .join("")
    .replace(/\/$/, "")
    .replace(/\(\?:\.\*\/\)\?$/, ".*");
  return new RegExp(`^${pattern}$`).test(file);
}
