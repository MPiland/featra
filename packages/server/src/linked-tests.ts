/**
 * Running the tests an acceptance criterion links (STORY-56). Each test file runs once with the project's linked test
 * command, which writes a JUnit report; a criterion is Proven only when the report has every one of its tests, passed
 * (ADR 0004). An exit code proves nothing: a runner that matched no test still exits 0.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fileCommand,
  groupByFile,
  parseJUnit,
  parseTestRefs,
  proofFromReport,
  runsWithTemplate,
  writesReport,
  type Card,
  type CheckOutcome,
  type TestRef,
} from "@featra/work-format";
import { tail, type RunResult } from "./check-run.ts";

export const LINKED_NOTES = {
  noTemplate: "Linked tests didn't run. Set a linked test command in Project settings.",
  noReport: "Can't prove linked tests without a report. Add {report} to the linked test command in Project settings.",
  noRunner: "No command runs this test.",
} as const;

/** What running the linked tests found. */
export interface LinkedRun {
  /** Each criterion with a verdict: Proven or not. One that couldn't be run is left out, so it stays as it was. */
  acs: CheckOutcome["acs"][number][];
  /** What failed, with the run's output, for the card. */
  failures: string;
  note: string | null;
}

export interface LinkedDeps {
  card: Card;
  /** The confirmed linked test command, or null. */
  template: string | null;
  /** The note when `template` is null. */
  without?: string;
  root: string;
  run: (command: string, cwd: string) => Promise<RunResult>;
  /** Whether a newer run was asked for, which makes this one's result worthless. */
  stale: () => boolean;
}

/** One linked test's verdict: it passed, it failed (and why), or it couldn't be run (and why). */
type Verdict = { kind: "proven" } | { kind: "failed"; why: string } | { kind: "unrunnable"; why: string };

const NONE: LinkedRun = { acs: [], failures: "", note: null };
const refKey = (ref: TestRef) => `${ref.file}\0${ref.name ?? ""}`;
const label = (ref: TestRef) => `${ref.file}${ref.name ? `::${ref.name}` : ""}`;

/** Runs one file's tests and reads the report: a verdict for each linked ref in it. */
async function runFile(file: string, refs: TestRef[], deps: LinkedDeps, template: string) {
  const names = groupByFile(refs)[0]?.names ?? [];
  const folder = await mkdtemp(join(tmpdir(), "featra-report-"));
  const report = join(folder, "report.xml");
  try {
    const made = fileCommand(template, { file, names }, process.platform, report);
    if (!made.ok) return { verdicts: refs.map((): Verdict => ({ kind: "unrunnable", why: made.reason })), output: "" };
    const result = await deps.run(made.command, deps.root);
    const cases = parseJUnit(await readFile(report, "utf8").catch(() => ""));
    const output = `${result.timedOut ? "Timed out.\n" : ""}${tail(result.output, 3000)}`;
    const verdicts = refs.map((ref): Verdict => {
      const proof = result.timedOut
        ? { proven: false as const, reason: "The run timed out." }
        : proofFromReport(cases, ref);
      return proof.proven ? { kind: "proven" } : { kind: "failed", why: proof.reason };
    });
    return { verdicts, output };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export async function runLinkedTests(deps: LinkedDeps): Promise<LinkedRun> {
  const { card, template, root } = deps;
  const perAc = card.acs.map((ac) => parseTestRefs(ac.test));
  if (!perAc.some((refs) => refs.length)) return NONE;
  if (!template) return { ...NONE, note: deps.without ?? LINKED_NOTES.noTemplate };
  if (!writesReport(template)) return { ...NONE, note: LINKED_NOTES.noReport };

  const all = perAc.flat();
  const runnable = all.filter((ref) => runsWithTemplate(ref.file));
  const verdicts = new Map<string, Verdict>();
  const outputs = new Map<string, string>();
  for (const { file } of groupByFile(runnable)) {
    if (deps.stale()) return NONE;
    const refs = runnable.filter((r) => r.file === file);
    if (!existsSync(join(root, file))) {
      for (const ref of refs) verdicts.set(refKey(ref), { kind: "failed", why: `${file} is not in this worktree.` });
      continue;
    }
    const ran = await runFile(file, refs, deps, template);
    refs.forEach((ref, i) => {
      const verdict = ran.verdicts[i];
      if (verdict) verdicts.set(refKey(ref), verdict);
    });
    outputs.set(file, ran.output);
  }

  const acs: LinkedRun["acs"] = [];
  const failures: string[] = [];
  const notes: string[] = [];
  perAc.forEach((refs, i) => {
    if (!refs.length) return;
    let failed = false;
    let stuck = false;
    for (const ref of refs) {
      const verdict = verdicts.get(refKey(ref)) ?? {
        kind: "unrunnable" as const,
        why: LINKED_NOTES.noRunner,
      };
      if (verdict.kind === "failed") {
        failed = true;
        failures.push(`AC ${i + 1}: ${label(ref)}\n${verdict.why}\n${outputs.get(ref.file) ?? ""}`.trimEnd());
      } else if (verdict.kind === "unrunnable") {
        stuck = true;
        notes.push(`AC ${i + 1}: ${verdict.why}`);
      }
    }
    if (failed) acs.push({ ac: i + 1, passed: false });
    else if (!stuck) acs.push({ ac: i + 1, passed: true });
  });
  return { acs, failures: failures.join("\n\n"), note: [...new Set(notes)].join(" ") || null };
}
