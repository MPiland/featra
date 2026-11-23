import { execFileSync } from "node:child_process";
import { REPO } from "./run.ts";

/**
 * BUG-28: no unit test may rely on a fixed wall-clock wait. On a busy PC one process start stalled for up to 77 s, so
 * any deadline a test set itself, or any time limit shorter than the run's hang guard, failed at random. Tests wait on
 * the condition (`until`, `next`, `expect.poll`, `waitFor`) and the hang guard (`tooling/hang-guard.ts`) ends a wait
 * that never ends.
 *
 * The waits listed here are allowed, each for its reason, by the exact line and how many times it appears in the file.
 * A time is part of the criterion: STORY-3 promises an edit reaches the app within 1 s. A quiet check waits a moment to
 * see nothing happen: on a slow PC it can only pass when it should not, never fail at random.
 */
export const ALLOWED: readonly { file: string; line: string; count: number; why: string }[] = [
  {
    file: "packages/server/test/ws-work.test.ts",
    line: 'const push = await socket.next((f) => f.event === "work.list", 1000);',
    count: 1,
    why: "STORY-3: within 1 s",
  },
  {
    file: "packages/server/test/ws-work.test.ts",
    line: 'const push = await socket.next((f) => f.event === "card.view", 1000);',
    count: 1,
    why: "STORY-3: within 1 s",
  },
  {
    file: "packages/server/test/ws-work.test.ts",
    line: 'await expect(socket.next((f) => f.event === "work.list", 400)).rejects.toThrow("No matching frame");',
    count: 1,
    why: "quiet: no push once unwatched",
  },
  {
    file: "packages/server/test/work-watch.test.ts",
    line: 'expect(titles(await joiner.next(1000))).toEqual(["Edited after the handover"]);',
    count: 1,
    why: "STORY-3: within 1 s",
  },
  {
    file: "packages/server/test/work-watch.test.ts",
    line: 'expect(titles(await heard.next(1000))).toEqual(["Edited on disk"]);',
    count: 1,
    why: "STORY-3: within 1 s",
  },
  {
    file: "packages/server/test/chat-approvals.test.ts",
    line: "await new Promise((r) => setTimeout(r, 20));",
    count: 1,
    why: "quiet: not answered yet",
  },
  {
    file: "packages/server/test/chat-questions.test.ts",
    line: "await new Promise((r) => setTimeout(r, 20));",
    count: 1,
    why: "quiet: not answered yet",
  },
  {
    file: "packages/server/test/copy-actions.test.ts",
    line: "await new Promise((r) => setTimeout(r, 100));",
    count: 1,
    why: "quiet: waits for the lane",
  },
  {
    file: "packages/server/test/feature-start-refusals.test.ts",
    line: "await new Promise((r) => setTimeout(r, 300));",
    count: 1,
    why: "quiet: waits for the lane",
  },
  {
    file: "packages/server/test/role-watch.test.ts",
    line: "await new Promise((r) => setTimeout(r, 300));",
    count: 1,
    why: "quiet: stopped watch hears none",
  },
  {
    file: "packages/server/test/chat-approvals-review.test.ts",
    line: 'const same = { ...BASH, description: "Run tests", timeout: 60_000, run_in_background: true };',
    count: 1,
    why: "data: a Bash tool call's own input",
  },
  {
    file: "packages/work-format/test/chat-rules.test.ts",
    line: 'const same = { ...BASH, description: "Run tests", timeout: 60_000, run_in_background: true };',
    count: 1,
    why: "data: a Bash tool call's own input",
  },
  {
    file: "tooling/test/hang-guard.test.ts",
    line: "expect: { poll: { timeout: 300_000 } },",
    count: 1,
    why: "data: the hang guard's own settings",
  },
  {
    file: "tooling/test/run.ts",
    line: "timeout: 120_000,",
    count: 1,
    why: "spawnSync blocks the event loop, so the hang guard can't end a hung child",
  },
];

const NUMBER = String.raw`\d[\d_]*(?:\.\d+)?(?:e\d+)?`;
const CONSTANT = String.raw`[A-Z][A-Z\d_]*`;
/** A fixed time as a test writes it: `5000`, `5_000`, `1e4`, `5 * 1000`, `GIT_ASKED_MS`. */
const TIME = String.raw`(?:${NUMBER}|${CONSTANT})(?:\s*[*+]\s*(?:${NUMBER}|${CONSTANT}))*`;

/** Whether an argument is a fixed time. A bare number under 100 is a count or an index, not a time. */
function isTime(arg: string): boolean {
  if (!new RegExp(`^${TIME}$`).test(arg)) return false;
  return !/^[\d_]+$/.test(arg) || Number(arg.replaceAll("_", "")) >= 100;
}

/** Fixed waits a single line shows. */
const LINE_WAITS: readonly { kind: string; pattern: RegExp }[] = [
  // An options object's limit, on the line of the call or on its own line: expect.poll, waitFor, findBy*, describe.
  { kind: "a time limit", pattern: new RegExp(String.raw`\btimeout\s*:\s*${TIME}\s*(?:[,}]|$)`) },
  { kind: "a deadline of its own", pattern: new RegExp(String.raw`Date\.now\(\)\s*\+\s*${TIME}\b`) },
  { kind: "a test or hook time limit", pattern: new RegExp(String.raw`^\s*\}\s*,\s*${TIME}\s*\)`) },
];

/** A sleep: fixed only when a check follows it, since one in a polling loop just paces the loop. */
const SLEEP = new RegExp(
  String.raw`setTimeout\(\s*(?:\w+|\(\)\s*=>\s*\w+\(\s*\))\s*,\s*${TIME}\s*\)|\b(?:sleep|delay)\(\s*${TIME}\s*\)`,
);

/** Calls whose last argument is a fixed time: a deadline on a wait helper, or a test's or hook's time limit. */
const TIMED_CALLS: readonly { kind: string; names: readonly string[] }[] = [
  { kind: "a deadline on a wait helper", names: ["until", "eventually", "next", "waitFor", "waitUntil"] },
  {
    kind: "a test or hook time limit",
    names: ["describe", "it", "test", "beforeAll", "beforeEach", "afterAll", "afterEach"],
  },
];

/**
 * BUG-39: `vi.waitFor` and `vi.waitUntil` keep their own 1 s default, which the hang guard's config doesn't reach, so
 * one left at it fails at random on a loaded PC. Tests use `until` (or Testing Library's `waitFor`, which the guard
 * sets). One given a time is already a deadline on a wait helper.
 */
const VITEST_WAITS = /(?<![\w$])vi\s*\.\s*(?:waitFor|waitUntil)\s*\(/g;
export const VITEST_WAIT_KIND = "vitest's own 1 s wait";

/** Product calls that run `gh`. A test's must say how long the fake may take, or it gets the product's 15 s kill. */
const GH_CALLS = ["detectGithub", "detectGithubUse", "repoIsPublic", "runGh", "ghJson", "readCiReports"];
export const GH_KIND = "a gh with the product's 15 s limit";

/** The index past a string, comment or bracketed span that starts at `i`; `i` itself when none starts there. */
function skip(text: string, i: number): number {
  const c = text[i];
  if (c === '"' || c === "'" || c === "`") {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === "\\") j++;
      else if (text[j] === c) return j + 1;
    }
    return text.length;
  }
  if (c === "/" && text[i + 1] === "/") {
    const end = text.indexOf("\n", i);
    return end < 0 ? text.length : end;
  }
  if (c === "/" && text[i + 1] === "*") {
    const end = text.indexOf("*/", i + 2);
    return end < 0 ? text.length : end + 2;
  }
  return i;
}

/** The top-level parts of the bracketed span opening at `open`, each with where it starts; null if it doesn't close. */
function parts(text: string, open: number): { text: string; at: number }[] | null {
  const found: { text: string; at: number }[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < text.length && i < open + 20_000;) {
    const past = skip(text, i);
    if (past !== i) {
      i = past;
      continue;
    }
    const c = text[i]!;
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    if (depth === 0 || (c === "," && depth === 1)) {
      const part = text.slice(start, i);
      const lead = part.length - part.trimStart().length;
      if (part.trim() !== "") found.push({ text: part.trim(), at: start + lead });
      if (depth === 0) return found;
      start = i + 1;
    }
    i++;
  }
  return null;
}

/** The object literal around `at`: from the nearest unclosed `{` before it to its `}`. */
function enclosingObject(text: string, at: number): string {
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{" && depth-- === 0) return (parts(text, i) ?? []).map((p) => p.text).join(", ");
  }
  return "";
}

const blank = (s: string) => s.replace(/[^\n]/g, " ");

/** The code alone: each string's and comment's text blanked, lines and positions kept, so neither reads as code. */
function codeOf(text: string): string {
  let out = "";
  for (let i = 0; i < text.length;) {
    const end = skip(text, i);
    if (end === i) {
      out += text[i];
      i++;
      continue;
    }
    const span = text.slice(i, end);
    out += text[i] === "/" ? blank(span) : span[0] + blank(span.slice(1, -1)) + (span.length > 1 ? span.at(-1) : "");
    i = end;
  }
  return out;
}

export function findings(file: string, source: string): string[] {
  const lines = source.split(/\r?\n/);
  const text = codeOf(source);
  const codeLines = text.split(/\r?\n/);
  const lineOf = (at: number) => text.slice(0, at).split("\n").length;
  const raw: { line: number; kind: string }[] = [];

  codeLines.forEach((line, i) => {
    for (const { kind, pattern } of LINE_WAITS) if (pattern.test(line)) raw.push({ line: i + 1, kind });
    if (!SLEEP.test(line)) return;
    const next = codeLines.slice(i + 1).find((l) => l.trim() !== "") ?? "";
    if (/^\s*(?:await\s+)?expect\b/.test(next)) raw.push({ line: i + 1, kind: "a sleep before a check" });
  });

  for (const { kind, names } of TIMED_CALLS) {
    for (const m of text.matchAll(new RegExp(String.raw`(?<![\w$])(${names.join("|")})\s*\(`, "g"))) {
      if (/function\s*$/.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
      const args = parts(text, m.index + m[0].length - 1);
      const last = args?.at(-1);
      if (!args || !last || !isTime(last.text)) continue;
      if (args.length >= 2 || m[1] === "next") raw.push({ line: lineOf(last.at), kind });
    }
  }

  for (const m of text.matchAll(VITEST_WAITS)) {
    const args = parts(text, m.index + m[0].length - 1);
    const options = args?.[1]?.text ?? "";
    if (args && (args.length < 2 || (options.startsWith("{") && !/\btimeout\s*:/.test(options)))) {
      raw.push({ line: lineOf(m.index), kind: VITEST_WAIT_KIND });
    }
  }

  for (const m of text.matchAll(new RegExp(String.raw`(?<![\w$])(${GH_CALLS.join("|")})\s*\(`, "g"))) {
    if (/function\s*$/.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
    const args = parts(text, m.index + m[0].length - 1);
    if (args && !args.some((a) => /[tT]imeoutMs\b/.test(a.text))) raw.push({ line: lineOf(m.index), kind: GH_KIND });
  }
  for (const m of text.matchAll(/\bghCommand\s*:/g)) {
    if (!/\bghTimeoutMs\b/.test(enclosingObject(text, m.index))) raw.push({ line: lineOf(m.index), kind: GH_KIND });
  }

  raw.sort((a, b) => a.line - b.line);
  const seen = new Set<string>();
  const unique = raw.filter((f) => !seen.has(`${f.line}:${f.kind}`) && seen.add(`${f.line}:${f.kind}`));
  return unique
    .filter((f) => {
      const at = lines[f.line - 1]!.trim();
      const entry = ALLOWED.find((a) => a.file === file && a.line === at);
      return !entry || unique.filter((g) => lines[g.line - 1]!.trim() === at).length !== entry.count;
    })
    .map((f) => `${file}:${f.line}: ${f.kind}: ${lines[f.line - 1]!.trim()}`);
}

/** The unit tests: every test folder and its helpers. The Electron e2e suite runs in CI only, with its own waits. */
export function testFiles(): string[] {
  const listed = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "packages/*/test/*",
      "apps/desktop/test",
      "tooling/test",
    ],
    { cwd: REPO, encoding: "utf8" },
  );
  return listed.split("\n").filter((f) => /\.(?:ts|tsx|cjs|mjs)$/.test(f) && f !== "tooling/test/test-waits.test.ts");
}
