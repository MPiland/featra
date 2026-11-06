import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO, run } from "./run.ts";

/**
 * Deliberately bad files, linted by the repo's real `.oxlintrc.json` (the normal `pnpm lint` skips `lint-fixtures/`).
 * Each bad fixture breaks exactly one rule; the `allowed` ones prove the rules don't reject what is fine.
 */
interface Diagnostic {
  code: string;
  filename: string;
}

/** Lints the paths in one run and returns each file's rule codes; `codes(file)` reads one file's. */
function lint(paths: string[], { typeAware = false } = {}) {
  const args = paths.map((p) => `"${p}"`).join(" ");
  const { stdout } = run(`pnpm exec oxlint -c .oxlintrc.json -f json ${typeAware ? "--type-aware " : ""}${args}`);
  const report = JSON.parse(stdout) as { diagnostics: Diagnostic[] };
  return (file: string): string[] =>
    report.diagnostics.filter((d) => resolve(REPO, d.filename) === resolve(REPO, file)).map((d) => d.code);
}

const RESTRICTED = "eslint(no-restricted-imports)";
const NODE_MODULE = "import(no-nodejs-modules)";
const WORK_FORMAT = "packages/work-format/lint-fixtures";
const CLIENT = "packages/client/lint-fixtures";
const SERVER = "packages/server/lint-fixtures";

const BOUNDARY_CASES: [file: string, code: string][] = [
  [`${WORK_FORMAT}/imports-react.ts`, RESTRICTED],
  [`${WORK_FORMAT}/imports-react-dom-client.ts`, RESTRICTED],
  [`${WORK_FORMAT}/imports-electron.ts`, RESTRICTED],
  [`${WORK_FORMAT}/imports-electron-main.ts`, RESTRICTED],
  [`${WORK_FORMAT}/imports-client.ts`, RESTRICTED],
  [`${WORK_FORMAT}/imports-node-fs.ts`, NODE_MODULE],
  [`${WORK_FORMAT}/imports-fs-promises.ts`, NODE_MODULE],
  [`${CLIENT}/imports-electron.ts`, RESTRICTED],
  [`${CLIENT}/imports-electron-renderer.ts`, RESTRICTED],
  [`${CLIENT}/imports-desktop.ts`, RESTRICTED],
  [`${CLIENT}/imports-node-fs.ts`, NODE_MODULE],
  [`${CLIENT}/imports-server.ts`, RESTRICTED],
  [`${SERVER}/imports-react.ts`, RESTRICTED],
  [`${SERVER}/imports-electron.ts`, RESTRICTED],
  [`${SERVER}/imports-client.ts`, RESTRICTED],
  [`${SERVER}/imports-desktop.ts`, RESTRICTED],
];

const PLUGIN_CASES: [file: string, code: string][] = [
  [`${CLIENT}/hook-after-return.tsx`, "react-hooks(rules-of-hooks)"],
  [`${CLIENT}/img-without-alt.tsx`, "jsx-a11y(alt-text)"],
  [`${CLIENT}/explicit-any.ts`, "typescript(no-explicit-any)"],
  [`${CLIENT}/duplicate-import.ts`, "import(no-duplicates)"],
  [`${CLIENT}/floating-promise.ts`, "typescript(no-floating-promises)"], // type-aware
];

const ALLOWED = [`${WORK_FORMAT}/allowed.ts`, `${CLIENT}/allowed.tsx`, `${SERVER}/allowed.ts`];

/** Every fixture, linted once with the type-aware rules on, as `pnpm lint` runs them. */
let codes: (file: string) => string[];
beforeAll(() => {
  codes = lint([WORK_FORMAT, CLIENT, SERVER], { typeAware: true });
});

describe("AC3: imports that break the package boundaries (ADR 0011) fail lint", () => {
  it.each(BOUNDARY_CASES)("%s fails with %s", (file, code) => {
    expect(codes(file)).toEqual([code]);
  });

  it.each(ALLOWED)("%s, which keeps to the boundaries, passes", (file) => {
    expect(codes(file)).toEqual([]);
  });

  it("every fixture is checked here", () => {
    const listed = new Set([...BOUNDARY_CASES.map(([f]) => f), ...PLUGIN_CASES.map(([f]) => f), ...ALLOWED]);
    const onDisk = [WORK_FORMAT, CLIENT, SERVER].flatMap((dir) =>
      readdirSync(join(REPO, dir)).map((f) => `${dir}/${f}`),
    );
    expect(onDisk.toSorted()).toEqual([...listed].toSorted());
  });
});

describe("AC2: lint runs the TypeScript, React Hooks, jsx-a11y and import rules, type-aware ones included", () => {
  it.each(PLUGIN_CASES)("%s fails with %s", (file, code) => {
    expect(codes(file)).toContain(code);
  });

  it("`pnpm lint` is type-aware, treats warnings as errors and skips the fixtures", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.lint).toMatch(/^oxlint /);
    expect(pkg.scripts.lint).toContain("--type-aware");
    expect(pkg.scripts.lint).toContain("--deny-warnings");
    expect(pkg.scripts.lint).toContain('--ignore-pattern "**/lint-fixtures/**"');
  });

  it("the whole repo passes `pnpm lint`", () => {
    const result = run("pnpm lint");
    expect(result.status, result.output).toBe(0);
  });
});

describe("AC4: a source file over the length cap fails lint", () => {
  const dir = mkdtempSync(join(tmpdir(), "featra-max-lines-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** A file of `code` statements, with `blank` blank lines and `comments` comment lines mixed in. */
  function source(name: string, code: number, blank = 0, comments = 0): string {
    const lines = Array.from({ length: code }, (_, i) => `export const v${i} = ${i};`);
    for (let i = 0; i < blank; i++) lines.splice(i * 2, 0, "");
    for (let i = 0; i < comments; i++) lines.splice(i * 3, 0, `// note ${i}`);
    const file = join(dir, name);
    writeFileSync(file, `${lines.join("\n")}\n`);
    return file;
  }

  it("300 lines of code pass; 301 fail; blank lines and comments don't count", () => {
    const files = [source("at-cap.ts", 300), source("over-cap.ts", 301), source("padded.ts", 300, 40, 40)];
    const [atCap, overCap, padded] = files;
    const lengthCodes = lint(files);
    expect(lengthCodes(atCap!)).toEqual([]);
    expect(lengthCodes(overCap!)).toEqual(["eslint(max-lines)"]);
    expect(lengthCodes(padded!)).toEqual([]);
  });

  it("no file is exempted: no override relaxes the cap and no file disables it", () => {
    const config = JSON.parse(readFileSync(join(REPO, ".oxlintrc.json"), "utf8")) as {
      rules: Record<string, unknown>;
      overrides: { rules: Record<string, unknown> }[];
    };
    expect(config.rules["max-lines"]).toEqual(["error", { max: 300, skipBlankLines: true, skipComments: true }]);
    expect(config.overrides.filter((o) => "max-lines" in o.rules)).toEqual([]);
    const disabling = run('git grep -l -E "(oxlint|eslint)-disable.*max-lines"');
    expect(disabling.stdout).toBe("");
  });
});
