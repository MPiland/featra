import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO } from "./run.ts";
import { ALLOWED, findings, GH_KIND, testFiles, VITEST_WAIT_KIND } from "./wait-scan.ts";

/** BUG-28: the scan in `wait-scan.ts` finds every fixed wait, however written, and none is left in the unit tests. */
const kinds = (sample: string[]) => findings("sample.test.ts", sample.join("\n")).map((f) => f.split(": ")[1]);

describe("no unit test relies on a fixed wall-clock wait (BUG-28)", () => {
  it("finds each kind of fixed wait, however it is written", () => {
    expect(
      kinds([
        "await until(() => done, 20_000);",
        "await until(ok, GIT_ASKED_MS);",
        "await socket.next((f) => f.id === 1, 5 * 1000);",
        "await eventually(check, 1e4);",
        "await vi.waitFor(() => expect(x).toBe(1), 5000);",
        "await vi.waitUntil(() => ready, { timeout: 5000 });",
        "await expect.poll(read, {",
        "  timeout: 10_000,",
        "}).toBe(1);",
        'await screen.findByText("Saved", {}, { timeout: 3000 });',
        "await waitFor(() => expect(a).toBe(1), { timeout: LONG_MS });",
        "const end = Date.now() + 10_000;",
        'describe("x", { timeout: 60_000 }, () => {',
        "}, 60_000);",
        'it("y", async () => {}, 30_000);',
        "await new Promise((r) => setTimeout(r, 300));",
        "expect(order).toEqual([]);",
        "await new Promise((r) => setTimeout(() => r(), 300));",
        "",
        "// then nothing more",
        "expect(a).toBe(1);",
        "await sleep(SETTLE_MS);",
        "await expect(read()).resolves.toBe(1);",
      ]),
    ).toEqual([
      "a deadline on a wait helper",
      "a deadline on a wait helper",
      "a deadline on a wait helper",
      "a deadline on a wait helper",
      "a deadline on a wait helper",
      "a time limit",
      "a time limit",
      "a time limit",
      "a time limit",
      "a deadline of its own",
      "a time limit",
      "a test or hook time limit",
      "a test or hook time limit",
      "a sleep before a check",
      "a sleep before a check",
      "a sleep before a check",
    ]);
  });

  it("finds vitest's own waits left at their 1 s default, which the hang guard doesn't reach (BUG-39)", () => {
    expect(
      kinds([
        'await vi.waitFor(() => expect(opened).toEqual(["chat-1"]));',
        "await vi.waitUntil(() => ready, { interval: 10 });",
        "await vi.waitFor(",
        "  () => expect(x).toBe(1),",
        ");",
      ]),
    ).toEqual([VITEST_WAIT_KIND, VITEST_WAIT_KIND, VITEST_WAIT_KIND]);
  });

  it("passes a wait on a condition, a sleep that paces a loop, and a number that isn't a time", () => {
    expect(
      kinds([
        "while (!ok()) await new Promise((r) => setTimeout(r, 20));",
        "await until(() => done);",
        "await until(() => rows.slice(0, 100).length > 0);",
        'it("says it (AC6, AC7) once", async () => {});',
        'await until(() => seen("a, 100"));',
        "await until(() => {",
        "  // it's read twice, 100 times",
        "  return reads() > 1;",
        "});",
        "export async function until(ok: () => boolean, ms?: number): Promise<void> {",
        "  const end = ms === undefined ? Infinity : Date.now() + ms;",
        "await waitFor(() => expect(a).toBe(1));",
        "const first = rows.next(1);",
        'it("z", async () => {});',
        "const control = runCommand(command, cwd, timeoutMs);",
      ]),
    ).toEqual([]);
  });

  it("finds a gh that would get the product's 15 s limit, and passes one without it", () => {
    expect(
      kinds([
        "await detectGithub(repo.main);",
        "await runGh(dir, args, { gh: gh.command });",
        "createCheckSettings({ scan, now, ghCommand: w.gh.command });",
        "await detectGithub(repo.main, { ghTimeoutMs: FAKE_GH_TIMEOUT_MS });",
        "await runGh(dir, args, { gh: gh.command, timeoutMs: FAKE_GH_TIMEOUT_MS });",
        "const deps = { ghCommand: gh.command, ghTimeoutMs: FAKE_GH_TIMEOUT_MS };",
        'import { detectGithub } from "../src/github-detect.ts";',
      ]),
    ).toEqual([GH_KIND, GH_KIND, GH_KIND]);
  });

  it("finds a CI run report read without a time for its gh (STORY-69)", () => {
    expect(
      kinds([
        "await readCiRunReports(dir, head, report, { gh: gh.command });",
        "await readCiRunReports(dir, head, report, { gh: gh.command, timeoutMs: FAKE_GH_TIMEOUT_MS });",
      ]),
    ).toEqual([GH_KIND]);
  });

  it("finds none in the unit tests, outside the waits allowed for their reason", () => {
    const files = testFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap((f) => findings(f, readFileSync(join(REPO, f), "utf8")))).toEqual([]);
  });

  it("allows each listed wait only on its exact line, as many times as listed", () => {
    const stale = ALLOWED.filter((a) => {
      const lines = readFileSync(join(REPO, a.file), "utf8").split(/\r?\n/);
      return lines.filter((l) => l.trim() === a.line).length !== a.count;
    });
    expect(stale).toEqual([]);
  });
});
