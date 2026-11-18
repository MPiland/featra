import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The waits a unit test is in, so a test the hang guard stops says what it was waiting for and where (BUG-30). Since
 * BUG-28 no wait has a deadline of its own, so a wait that never ends ends at the hang guard, whose timeout alone names
 * nothing. Every wait helper notes its wait here: `until`, the server tests' `next`, Testing Library's waits (the
 * client's setup file) and `expect.poll` (`wait-report-setup.ts`). That setup file adds the open waits to a failed
 * test's errors.
 */
interface Frame {
  file: string;
  line: number;
}

interface Wait {
  what: string;
  at: Frame[];
  since: number;
  ended: boolean;
}

/** One open wait. `ended` turns true once the failed test it belongs to is over, so a wait left running can stop. */
export interface WaitHandle {
  readonly ended: boolean;
  end: () => void;
}

const open = new Set<Wait>();
// Paths, not URLs: under jsdom the global URL is jsdom's, which node's fileURLToPath refuses.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const SHOWN = 160;
const norm = (p: string) => p.replaceAll("\\", "/").toLowerCase();
/** This file and the setup file that notes `expect.poll`: their frames are never where a test waited. */
const OWN = new Set(["waits.ts", "wait-report-setup.ts"].map((f) => norm(join(HERE, f))));
const FRAME = /\(?((?:file:\/\/\/?)?[^\s()]+?):(\d+):\d+\)?$/;

/** A function's code on one line, cut short: what a wait is waiting for. */
export function codeOf(fn: unknown): string {
  const code = String(fn).replace(/\s+/g, " ").trim();
  return code.length > SHOWN ? `${code.slice(0, SHOWN - 1)}…` : code;
}

/** Each frame of a stack outside this file, the setup file, node's own and node_modules. */
function frames(stack: string): Frame[] {
  const found: Frame[] = [];
  for (const text of stack.split("\n").slice(1)) {
    const [, where, line] = FRAME.exec(text.trim()) ?? [];
    if (where === undefined || line === undefined || where.startsWith("node:")) continue;
    const file = where.startsWith("file:") ? fileURLToPath(where) : where;
    if (OWN.has(norm(file)) || /[\\/]node_modules[\\/]/.test(file)) continue;
    found.push({ file, line: Number(line) });
  }
  return found;
}

/**
 * Where a wait was asked for: the test file's line, through any helpers and setup files, or else the first line of
 * the caller's own code. The stack is read with room for Testing Library's own frames.
 */
function callSite(): Frame[] {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  const stack = new Error("wait").stack ?? "";
  Error.stackTraceLimit = limit;
  const all = frames(stack);
  const at = all.find((f) => /\.test\.tsx?$/.test(f.file)) ?? all[0];
  return at === undefined ? [] : [at];
}

/** Starts noting a wait for `what`; `end()` it when the wait is over. */
export function startWait(what: string): WaitHandle {
  const wait: Wait = { what, at: callSite(), since: Date.now(), ended: false };
  open.add(wait);
  return {
    get ended() {
      return wait.ended;
    },
    end: () => {
      wait.ended = true;
      open.delete(wait);
    },
  };
}

/** Notes `wait` as a wait for `what` until it settles. */
export function waitingFor<T>(what: string, wait: PromiseLike<T>): Promise<T> {
  const handle = startWait(what);
  return Promise.resolve(wait).finally(handle.end);
}

/**
 * Waits until `ok` holds, checking every 20 ms. It sets no deadline of its own: on a busy PC one git start stalled for
 * up to 77 s (BUG-28), so any fixed wait failed at random. A condition that never holds fails at the hang guard
 * (`tooling/hang-guard.ts`), which then names it. Give `ms` only where a criterion promises a time.
 */
export async function until(ok: () => boolean | Promise<boolean>, ms?: number): Promise<void> {
  const wait = startWait(`until ${codeOf(ok)}`);
  const end = ms === undefined ? Infinity : Date.now() + ms;
  try {
    while (!(await ok())) {
      if (Date.now() > end) throw new Error(`Not seen in ${ms} ms`);
      if (wait.ended) throw new Error(`The test ended while waiting until ${codeOf(ok)}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  } finally {
    wait.end();
  }
}

/** `file:line`, relative to the repo, and that line's code. */
function shown({ file, line }: Frame): string {
  let code = "";
  try {
    code = readFileSync(file, "utf8").split(/\r?\n/)[line - 1]?.trim() ?? "";
  } catch {
    // A frame in generated code has no file to read.
  }
  const where = `${relative(REPO, file).replaceAll("\\", "/")}:${line}`;
  return code === "" ? where : `${where}: ${code}`;
}

/** The waits still open, each with how long it has waited and where it was asked for; undefined when none is. */
export function openWaits(now = Date.now()): string | undefined {
  if (open.size === 0) return undefined;
  const lines: string[] = [];
  for (const w of open) {
    lines.push(`- ${w.what} (for ${Math.round((now - w.since) / 1000)} s)`);
    for (const f of w.at) lines.push(`    at ${shown(f)}`);
  }
  return `The test ended while still waiting for:\n${lines.join("\n")}`;
}

/** Ends every open wait: they belong to a failed test, and one left polling would run on into the next. */
export function endWaits(): void {
  for (const w of open) w.ended = true;
  open.clear();
}

/** Stops noting the open waits but lets them run: a passing test may leave one, and the next test's list starts empty. */
export function forgetWaits(): void {
  open.clear();
}
