import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REPO, run } from "./run.ts";

/**
 * Runs the real `pnpm check` on the repo with one badly formatted file added. The check stops at its first step, so
 * it never reaches the unit tests (and this test) again; the environment flag guards against that anyway. The probe
 * is JSON, which only the formatter reads, so lint and typecheck running alongside never see it.
 */
const NESTED = "FEATRA_CHECK_TEST_NESTED";
const probeName = `format-probe-${process.pid}.json`;
const UNFORMATTED = '{"a":1,   "b":[1,2]}\n';
const probe = join(REPO, "tooling", probeName);
const env = { ...process.env, [NESTED]: "1" };

afterEach(() => rmSync(probe, { force: true }));

describe.skipIf(process.env[NESTED] === "1")("AC1 and AC5: the gate rejects unformatted code", () => {
  it("`pnpm check` fails on a formatting violation anywhere in the repo, naming the file", () => {
    writeFileSync(probe, UNFORMATTED);
    const result = run("pnpm check", { env });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(probeName);
    expect(result.output).not.toMatch(/Test Files/); // stopped before the unit tests
  });

  it("`pnpm format:check` flags the file and `pnpm format` fixes it", () => {
    writeFileSync(probe, UNFORMATTED);
    expect(run(`pnpm format:check "${probe}"`, { env }).status).not.toBe(0);
    expect(run(`pnpm format "${probe}"`, { env }).status).toBe(0);
    expect(readFileSync(probe, "utf8")).toBe('{ "a": 1, "b": [1, 2] }\n');
    expect(run(`pnpm format:check "${probe}"`, { env }).status).toBe(0);
  });

  it("`pnpm check` runs format check, lint, typecheck and unit tests, in that order", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.check).toBe("pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit");
    expect(pkg.scripts["format:check"]).toBe("oxfmt --check");
    expect(pkg.scripts.format).toBe("oxfmt");
  });
});
