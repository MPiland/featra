/**
 * STORY-63: CI runs the e2e suite on macOS as on Windows and Ubuntu, and each platform's JUnit report proves criteria
 * together with the others. The reports are real Playwright runs with the e2e suite's own reporters; Featra reads them
 * through its real report reader and proof, with GitHub played by the fake `gh`.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCard, parseConfig, type CheckOutcome } from "@featra/work-format";
import { createCiProven } from "../../../packages/server/src/ci-proven.ts";
import { FAKE_GH_TIMEOUT_MS, fakeGh, junitXml, type FakeGh } from "../../../packages/server/test/fake-gh.ts";
import { REPO, run, workflow, workflowJob } from "../../../tooling/test/run.ts";

const PLATFORMS = ["windows", "ubuntu", "macos"] as const;
const HEAD = "c".repeat(40);
const FIXTURE = "apps/desktop/test/report-fixture/platform.spec.ts";
const UNIT = "packages/app/test/a.test.ts";

/** What each e2e job of ci.yml writes its JUnit report as, and the artifact it uploads it in. */
function reportOf(platform: string): { file: string; artifact: string } {
  const job = workflowJob("ci.yml", `e2e-${platform}`);
  const file = /^ {10}FEATRA_JUNIT: (test-report\/[\w.-]+\.xml)$/m.exec(job)?.[1] ?? "";
  const upload =
    /- name: Upload the e2e test report\n\s+if: success\(\) \|\| failure\(\)\n\s+uses: actions\/upload-artifact@v4\n\s+with:\n\s+name: (\S+)\n\s+path: test-report\n/.exec(
      job,
    );
  return { file, artifact: upload?.[1] ?? "" };
}

const card = parseCard(`---
id: STORY-1
type: story
title: Works everywhere
status: In Review
parent: FEAT-1
created: 2026-11-18T12:00:00Z
history: []
---

## Acceptance criteria

- [ ] Works on every platform (test: ${FIXTURE}::a platform's e2e run > works on every platform)
- [ ] Works on macOS too (test: ${FIXTURE}::a platform's e2e run > works except on macOS)
- [ ] Unit tested (test: ${UNIT}::works)
`);

/** A doc's text with its line breaks and runs of spaces as single spaces, since prose wraps anywhere. */
const text = (file: string) => readFileSync(join(REPO, file), "utf8").replace(/\s+/g, " ");

let gh: FakeGh;
let out: string;
beforeEach(async () => {
  gh = await fakeGh();
  out = await mkdtemp(join(tmpdir(), "featra-e2e-report-"));
});
afterEach(async () => {
  await gh.dispose();
  await rm(out, { recursive: true, force: true });
});

/** Runs the fixture as `platform`'s CI job runs the e2e suite, and gives back the JUnit report it wrote. */
async function e2eRun(platform: string): Promise<string> {
  const file = join(out, `e2e-${platform}.xml`);
  const r = run("pnpm --filter @featra/desktop exec playwright test -c test/report-fixture/playwright.config.ts", {
    env: {
      ...process.env,
      FEATRA_JUNIT: file,
      FIXTURE_OUTPUT: join(out, `results-${platform}`),
      FIXTURE_OS: platform,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    },
  });
  expect(r.status, r.output).toBe(platform === "macos" ? 1 : 0);
  return readFile(file, "utf8");
}

describe("each platform's e2e report proves criteria with the others (STORY-63)", () => {
  it("doesn't prove a criterion whose test failed only on macOS, reading every platform's report CI uploads", async () => {
    const artifacts: Record<string, Record<string, string>> = {
      "test-report-unit": { "unit.xml": junitXml([[UNIT, "works", "passed"]]) },
    };
    for (const platform of PLATFORMS) {
      const { file, artifact } = reportOf(platform);
      expect(file, platform).toBe(`test-report/e2e-${platform}.xml`);
      artifacts[artifact] = { [file.replace("test-report/", "")]: await e2eRun(platform) };
    }
    await gh.change((s) => {
      s.runs = [{ id: 7, headSha: HEAD, artifacts }];
    });
    const config = parseConfig(readFileSync(join(REPO, ".featra", "config.yaml"), "utf8"));
    const recorded: CheckOutcome[] = [];
    const proven = createCiProven({
      ghCommand: gh.command,
      ghTimeoutMs: FAKE_GH_TIMEOUT_MS,
      record: (_dir, _id, outcome) => {
        recorded.push(outcome);
        return true;
      },
    });
    const pr = { number: 1, url: "https://github.com/o/r/pull/1", head: HEAD, repo: "o/r" };
    await proven.read(gh.bin, card, config, { ...pr, status: { state: "open", checks: "failing" } });

    // Each proven criterion keeps the run that proved it (STORY-69); the one that failed on macOS has none.
    expect(recorded.at(-1)?.acs).toEqual([
      { ac: 1, passed: true, run: "https://github.com/o/r/actions/runs/7" },
      { ac: 2, passed: false },
      { ac: 3, passed: true, run: "https://github.com/o/r/actions/runs/7" },
    ]);
    const proof = proven.proofOf(gh.bin, card.id);
    expect(proof?.failedAcs).toEqual([2]);
    expect(proof?.missingAcs).toEqual([]);
    expect(proof?.note).toBeNull();
    const downloads = (await gh.calls()).map((c) => c.args).filter((a) => a[1] === "download");
    expect(downloads.map((a) => a.slice(3, 5))).toEqual([["-p", "test-report-*"]]);
  });
});

describe("CI runs the e2e suite on macOS (STORY-63)", () => {
  it("runs an E2E (macOS) job on an Apple silicon runner on every PR and push to main", () => {
    expect(workflow("ci.yml")).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n/m);
    const job = workflowJob("ci.yml", "e2e-macos");
    expect(job).toMatch(/^ {4}name: E2E \(macOS\)\n/m);
    // macos-15 is GitHub's arm64 (M1) image; its Intel image is macos-15-intel.
    expect(job).toMatch(/^ {4}runs-on: macos-15\n/m);
    expect(job).toMatch(/- uses: \.\/\.github\/actions\/setup\n\s+with:\n\s+e2e: "true"\n/);
    expect(job).toMatch(/- name: E2E suite\n\s+run: pnpm test:e2e\n/);
  });

  it("uploads a failed macOS run's screenshots and traces, and the screens for design review, as the others do", () => {
    for (const platform of PLATFORMS) {
      const job = workflowJob("ci.yml", `e2e-${platform}`);
      expect(job, platform).toMatch(
        new RegExp(
          String.raw`- name: Upload screenshots and traces of failed tests\n\s+if: failure\(\) \|\| cancelled\(\)\n\s+uses: actions/upload-artifact@v4\n\s+with:\n\s+name: e2e-${platform}-traces\n\s+path: apps/desktop/test-results\n`,
        ),
      );
      expect(job, platform).toMatch(
        new RegExp(
          String.raw`- name: Upload screens for design review\n\s+if: always\(\)\n\s+uses: actions/upload-artifact@v4\n\s+with:\n\s+name: ux-screens-${platform}\n\s+path: apps/desktop/test-results/ux\n`,
        ),
      );
    }
  });

  it("says in the README and docs/testing.md that macOS is tested on CI, and names the check to require", () => {
    expect(text("README.md")).toContain("CI runs its end-to-end tests on all three on every pull request");
    expect(text("README.md")).toContain("Windows, macOS and Linux");
    const docs = text("docs/testing.md");
    expect(docs).toContain("**E2E (macOS)**: `pnpm test:e2e` on GitHub's Apple silicon macOS runner");
    expect(docs).toContain("Add **E2E (macOS)** to main's required checks once it passes on main");
    for (const named of ["e2e-macos-traces", "ux-screens-macos", "test-report-e2e-macos", "`macos`"]) {
      expect(docs, named).toContain(named);
    }
  });
});
