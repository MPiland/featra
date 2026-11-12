/**
 * The commands behind local checks (STORY-56): what an acceptance criterion's linked test is, how one test's command
 * is made from the project's template without letting card text into the shell, and which commands Featra proposes
 * from the project's files. Pure.
 */
import type { CheckProposal } from "./checks-types.ts";
import { fullName } from "./junit.ts";
import { isRecord } from "./utils/guards.ts";

/** One linked test: a test file in the project and, when the link names one, the test's full name. */
export interface TestRef {
  file: string;
  /** The test's name as a runner prints it: its describe names and its own, joined by spaces. Null: the whole file. */
  name: string | null;
}

const FILE = String.raw`[\w@.\\/-]+\.(?:test|spec)\.[cm]?[jt]sx?`;
const TEST_FILE = new RegExp(`^${FILE}$`);

/**
 * The tests an AC links, from its `(test: ...)` text. Each is a test file (named `*.test.ts`, `*.spec.ts`, and so on),
 * then optionally `::` and the test's name (describe and test names joined with ` > `), or the name in quotes after a
 * space. Several are separated by `;` or `,` before the next file. Anything else in the text (a doc, a prose note) is
 * not a test Featra can run and is left out.
 */
export function parseTestRefs(link: string | null): TestRef[] {
  if (!link) return [];
  const starts = [...link.matchAll(new RegExp(`(?:^|[;,]\\s*|\\band\\s+)(${FILE})`, "g"))];
  return starts.map((m, i) => {
    const after = m.index + m[0].length;
    const next = starts[i + 1];
    const span = link.slice(after, next ? next.index : undefined);
    const rest = (span.split(";")[0] ?? "").replace(/[,\s]+$/, "");
    const quoted = /^\s+"([^"]*)"/.exec(rest)?.[1];
    const named = rest.startsWith("::") ? rest.slice(2) : undefined;
    const name = fullName(quoted ?? named ?? "");
    return { file: (m[1] ?? "").replaceAll("\\", "/"), name: name || null };
  });
}

/** Whether `file` is a safe relative path to a test file inside the worktree. */
export const isTestFile = (file: string): boolean =>
  TEST_FILE.test(file) && !file.startsWith("/") && !file.split("/").includes("..") && !/^[a-z]:/i.test(file);

/** A value made safe as one argument of the platform's shell, or why it can't be. */
export type Quoted = { ok: true; arg: string } | { ok: false; reason: string };

/**
 * `value` as one shell argument. POSIX shells: in single quotes, which take everything literally. Windows: in double
 * quotes, which cmd.exe still reads `%`, `^`, `!` and `"` in, so a value with any of them is refused rather than guessed
 * at. A line break or NUL is refused everywhere.
 */
export function quoteArg(value: string, platform: string = process.platform): Quoted {
  if (/[\r\n\0]/.test(value)) return { ok: false, reason: "has a line break" };
  if (platform !== "win32") return { ok: true, arg: `'${value.replaceAll("'", `'\\''`)}'` };
  const bad = /["%^!]/.exec(value)?.[0];
  return bad ? { ok: false, reason: `has a ${bad} the shell would read` } : { ok: true, arg: `"${value}"` };
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** A linked test file and the names linked in it, for one run of the file. No names: the whole file runs. */
export interface FileTests {
  file: string;
  names: readonly string[];
}

/** The linked tests by file, so a file is run once however many of its tests are linked; a whole-file link wins. */
export function groupByFile(refs: readonly TestRef[]): FileTests[] {
  const files = new Map<string, { whole: boolean; names: Set<string> }>();
  for (const ref of refs) {
    const group = files.get(ref.file) ?? { whole: false, names: new Set<string>() };
    if (ref.name === null) group.whole = true;
    else group.names.add(ref.name);
    files.set(ref.file, group);
  }
  return [...files].map(([file, { whole, names }]) => ({ file, names: whole ? [] : [...names] }));
}

/**
 * Whether the project's linked test command can run a test file. Browser and end-to-end suites (under an `e2e`,
 * `playwright` or `cypress` folder) have their own runners, which one template for unit tests can't stand in for.
 */
export const runsWithTemplate = (file: string): boolean => !/(^|\/)(e2e|playwright|cypress)\//i.test(file);

/** Whether the template writes a JUnit report; without one a linked test can't be proven. */
export const writesReport = (template: string): boolean => template.includes("{report}");

export type TestCommand = { ok: true; command: string } | { ok: false; reason: string };

/**
 * The command that runs the linked tests of one file, from the project's template. `{file}` is the test file, `{name}`
 * the one linked test's name, `{namePattern}` the names escaped for a runner that reads `-t` as a pattern (several are
 * alternatives), and `{report}` the path the runner writes its JUnit report to. Each is one quoted argument, and the
 * template is the only text that is not. No names gives an empty name, which runners read as every test. Placeholders
 * are filled in one pass, so a value is never read as a placeholder.
 */
export function fileCommand(
  template: string,
  { file, names }: FileTests,
  platform: string = process.platform,
  report?: string,
): TestCommand {
  if (!isTestFile(file)) return { ok: false, reason: `${file} isn't a test file inside the project` };
  if (names.length > 1 && /\{name\}/.test(template)) {
    return { ok: false, reason: `${file} links several tests, which {name} can't name. Use {namePattern}.` };
  }
  if (report === undefined && writesReport(template)) return { ok: false, reason: "There is no place for the report." };
  const values: Record<string, string> = {
    file,
    name: names[0] ?? "",
    namePattern: names.map(escapeRegExp).join("|"),
    report: report ?? "",
  };
  let refused: string | null = null;
  const command = template.replace(/\{(file|name|namePattern|report)\}/g, (_all, key: string) => {
    const quoted = quoteArg(values[key] ?? "", platform);
    if (!quoted.ok)
      refused ??= `The test's ${key === "file" ? "file" : key === "report" ? "report path" : "name"} ${quoted.reason}.`;
    return quoted.ok ? quoted.arg : "";
  });
  return refused === null ? { ok: true, command } : { ok: false, reason: refused };
}

/** The command that runs one linked test: `fileCommand` for a file with that one name. */
export const testCommand = (
  template: string,
  ref: TestRef,
  platform: string = process.platform,
  report?: string,
): TestCommand =>
  fileCommand(template, { file: ref.file, names: ref.name === null ? [] : [ref.name] }, platform, report);

/** What Featra reads of the project's files to propose commands: `package.json` and which lockfiles are there. */
export interface ProjectFiles {
  packageJson: string | null;
  lockfiles: readonly string[];
}

// Only a runner that can write a JUnit report to a path of our choosing can prove a linked test (ADR 0031).
const RUNNERS = [
  { dep: "vitest", template: "npx vitest run {file} -t {namePattern} --reporter=junit --outputFile={report}" },
] as const;

const NPM = { test: "npm test", exec: "npx" };
const MANAGERS = [
  { lock: "pnpm-lock.yaml", test: "pnpm test", exec: "pnpm exec" },
  { lock: "yarn.lock", test: "yarn test", exec: "yarn" },
  { lock: "bun.lockb", test: "bun run test", exec: "bunx" },
  { lock: "bun.lock", test: "bun run test", exec: "bunx" },
] as const;

const names = (deps: unknown) => (isRecord(deps) ? Object.keys(deps) : []);

/**
 * The commands Featra proposes from the project's files: the `test` script of `package.json`, run with the package
 * manager the lockfile names, and a linked-test template for the test runner it depends on. A proposal is only that;
 * the user confirms it in Project settings.
 */
export function proposeCommands({ packageJson, lockfiles }: ProjectFiles): CheckProposal[] {
  let pkg: unknown;
  try {
    pkg = packageJson === null ? null : JSON.parse(packageJson);
  } catch {
    return [];
  }
  if (!isRecord(pkg)) return [];
  const { scripts, dependencies, devDependencies } = pkg;
  const manager = MANAGERS.find((m) => lockfiles.includes(m.lock)) ?? NPM;
  const out: CheckProposal[] = [];
  const test = isRecord(scripts) ? scripts.test : null;
  if (typeof test === "string" && test.trim()) {
    out.push({ field: "command", value: manager.test, source: "package.json" });
  }
  const have = new Set([...names(dependencies), ...names(devDependencies)]);
  const runner = RUNNERS.find((r) => have.has(r.dep));
  if (runner) {
    out.push({ field: "testCommand", value: runner.template.replace("npx", manager.exec), source: "package.json" });
  }
  return out;
}
