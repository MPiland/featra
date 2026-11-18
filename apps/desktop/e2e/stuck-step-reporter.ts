import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import { keptFiles } from "./evidence.ts";

/**
 * Says where a failed e2e test stopped (BUG-30). When the test timeout ends a test that is waiting in a step, the
 * list reporter prints only "Test timeout of 60000ms exceeded": the step it was in, and the locator it waited for,
 * reached only the trace. This reporter prints, under the failed test's line: the step it was in (or the last that
 * failed), its code line, which names the locator as written, how long it ran, its error, and the files kept for it.
 */

/** What this reporter reads of a step: Playwright's `TestStep` has it all. */
export interface Step {
  title: string;
  category: string;
  location?: { file: string; line: number };
  duration: number;
  startTime: Date;
  error?: { message?: string };
  parent?: Step;
  titlePath: () => string[];
}
type Annotated = { annotations: readonly { type: string; description?: string }[] };

/** Steps the harness takes after the test body ends (hooks, fixtures such as the evidence fixture): never the cause. */
const AFTER_THE_FACT = new Set(["hook", "fixture"]);
const ERROR_LINES = 12;

function inHarness(step: Step): boolean {
  for (let s: Step | undefined = step; s !== undefined; s = s.parent) if (AFTER_THE_FACT.has(s.category)) return true;
  return false;
}

const firstLine = (message: string | undefined) =>
  stripVTControlCharacters(message ?? "")
    .trim()
    .split("\n")[0];

/** What this reporter reads of a test's result. */
export interface Outcome {
  status: string;
  errors: readonly { message?: string }[];
}

/**
 * The step a failed test stopped in: the last it began that never ended, or else the last that failed with an error
 * the test failed with, so not one whose failure the test caught. A timeout can drop the error that was on its way
 * out (seen on Windows: a click's timeout, then a cleanup that ran out the test's time), so a timed-out test with no
 * such step falls back to the last step that failed. A step with no place in the test's code, such as one try of
 * `expect.poll`, gives way to the step around it that has one.
 */
export function stoppedStep(begun: readonly Step[], ended: ReadonlySet<Step>, outcome: Outcome): Step | undefined {
  const own = begun.filter((s) => !inHarness(s));
  const failedWith = new Set(outcome.errors.map((e) => firstLine(e.message)));
  const failed = own.filter((s) => s.error !== undefined);
  let step: Step | undefined =
    own.findLast((s) => !ended.has(s)) ??
    failed.findLast((s) => failedWith.has(firstLine(s.error?.message))) ??
    (outcome.status === "timedOut" ? failed.at(-1) : undefined);
  while (step?.location === undefined && step?.parent !== undefined) step = step.parent;
  return step;
}

const STATEMENT_LINES = 8;
const count = (text: string, char: string) => text.split(char).length - 1;

/**
 * The code a step's line belongs to, on one line. A formatted chain puts `.click()` on a line of its own, below the
 * locator it acts on, so lines are joined back while the line starts a chain link (`.`, `)`) or its brackets are open.
 */
export function codeAt(file: string, line: number): string {
  let lines: string[];
  try {
    lines = readFileSync(file, "utf8").split(/\r?\n/);
  } catch {
    return "";
  }
  let start = line - 1;
  let code = lines[start]?.trim() ?? "";
  const continues = () => /^[.)\]]/.test(code) || count(code, "(") < count(code, ")");
  while (start > 0 && line - start < STATEMENT_LINES && continues()) {
    start -= 1;
    code = `${lines[start]?.trim() ?? ""}${code}`;
  }
  return code;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const fromRoot = (root: string, file: string) => relative(root, file).replaceAll("\\", "/");

/** The lines that say where a test stopped. `ended` is when the test ended, for a step that never did. */
export function whereItStopped(
  test: Annotated & { title: string },
  result: Annotated & { status: string },
  stopped: { step: Step | undefined; finished: boolean; ended: number },
  root: string,
): string[] {
  const { step, finished } = stopped;
  const lines = [`Where "${test.title}" stopped (${result.status}):`];
  if (step === undefined) lines.push("  In no step: in the test's own code, before or between steps.");
  else {
    const outer = step.titlePath().slice(0, -1);
    lines.push(`  Step: ${step.title}`);
    if (outer.length > 0) lines.push(`  Inside: ${outer.join(" > ")}`);
    if (step.location !== undefined) {
      const { file, line } = step.location;
      const code = codeAt(file, line);
      lines.push(`  At: ${fromRoot(root, file)}:${line}${code === "" ? "" : `: ${code}`}`);
    }
    const ran = finished ? step.duration : stopped.ended - step.startTime.getTime();
    lines.push(
      finished ? `  Failed after ${seconds(ran)}` : `  Still running after ${seconds(ran)} when the test ended`,
    );
    // Playwright colours the call log in an error; a CI log shows the codes as text.
    const message = step.error?.message === undefined ? undefined : stripVTControlCharacters(step.error.message);
    if (message !== undefined) {
      lines.push(
        "  Its error:",
        ...message
          .split("\n")
          .slice(0, ERROR_LINES)
          .map((l) => `    ${l}`),
      );
    }
  }
  const kept = keptFiles(result.annotations, test.annotations);
  if (kept.length > 0) lines.push("  Kept:", ...kept.map((f) => `    ${fromRoot(root, f)}`));
  return lines;
}

export default class StuckStepReporter implements Reporter {
  private readonly begun = new Map<TestResult, TestStep[]>();
  private readonly ended = new Map<TestResult, Set<Step>>();
  private readonly root: string;

  constructor(options: { root?: string } = {}) {
    this.root = options.root ?? process.cwd();
  }

  onStepBegin(_test: TestCase, result: TestResult, step: TestStep): void {
    const steps = this.begun.get(result) ?? [];
    steps.push(step);
    this.begun.set(result, steps);
  }

  onStepEnd(_test: TestCase, result: TestResult, step: TestStep): void {
    const done = this.ended.get(result) ?? new Set<Step>();
    done.add(step);
    this.ended.set(result, done);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const begun = this.begun.get(result) ?? [];
    const ended = this.ended.get(result) ?? new Set<Step>();
    this.begun.delete(result);
    this.ended.delete(result);
    if (result.status === test.expectedStatus || result.status === "skipped") return;
    const step = stoppedStep(begun, ended, result);
    const stopped = {
      step,
      finished: step !== undefined && ended.has(step),
      ended: result.startTime.getTime() + result.duration,
    };
    const lines = whereItStopped(test, result, stopped, this.root);
    process.stdout.write(`${lines.map((l) => `      ${l}`).join("\n")}\n`);
  }

  printsToStdio(): boolean {
    return true;
  }
}
