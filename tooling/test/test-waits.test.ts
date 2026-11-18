import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO } from "./run.ts";

/**
 * BUG-28: no unit test may rely on a fixed wall-clock wait. On a busy PC one process start stalled for up to 77 s, so
 * any deadline a test set itself, or any time limit shorter than the run's hang guard, failed at random. Tests wait on
 * the condition (`until`, `next`, `expect.poll`) and the hang guard (`tooling/hang-guard.ts`) ends a wait that never ends.
 *
 * The waits listed here are allowed, each for its reason. A time is part of the criterion: STORY-3 promises an edit
 * reaches the app within 1 s. A quiet check waits a moment to see nothing happen: on a slow PC it can only pass when
 * it should not, never fail at random.
 */
const ALLOWED: readonly { file: string; line: string; why: string }[] = [
  { file: "packages/server/test/ws-work.test.ts", line: '"work.list", 1000)', why: "STORY-3: within 1 s" },
  { file: "packages/server/test/ws-work.test.ts", line: '"card.view", 1000)', why: "STORY-3: within 1 s" },
  { file: "packages/server/test/ws-work.test.ts", line: '"work.list", 400)', why: "quiet: no push once unwatched" },
  { file: "packages/server/test/work-watch.test.ts", line: "joiner.next(1000)", why: "STORY-3: within 1 s" },
  { file: "packages/server/test/work-watch.test.ts", line: "heard.next(1000)", why: "STORY-3: within 1 s" },
  { file: "packages/server/test/chat-approvals.test.ts", line: "setTimeout(r, 20)", why: "quiet: not answered yet" },
  { file: "packages/server/test/chat-questions.test.ts", line: "setTimeout(r, 20)", why: "quiet: not answered yet" },
  { file: "packages/server/test/copy-actions.test.ts", line: "setTimeout(r, 100)", why: "quiet: waits for the lane" },
  {
    file: "packages/server/test/feature-start-refusals.test.ts",
    line: "setTimeout(r, 300)",
    why: "quiet: waits for the lane",
  },
  {
    file: "packages/server/test/role-watch.test.ts",
    line: "setTimeout(r, 300)",
    why: "quiet: stopped watch hears none",
  },
];

/** What makes a test wait for a fixed time, each with the way it is written. */
const FIXED_WAITS: readonly { kind: string; pattern: RegExp }[] = [
  { kind: "a deadline on a wait helper", pattern: /\b(?:until|next|eventually)\([^;]*,\s*[\d_]{3,}\)/ },
  { kind: "a deadline on expect.poll", pattern: /expect\s*\.poll\([^;]*\{\s*timeout:/ },
  { kind: "a deadline of its own", pattern: /Date\.now\(\)\s*\+\s*[\d_]+/ },
  { kind: "a test or hook time limit", pattern: /\{\s*timeout:\s*[\d_]+\s*\},\s*(?:async\s*)?\(/ },
  { kind: "a test or hook time limit", pattern: /^\s*\{\s*timeout:\s*[\d_]+\s*\},\s*$/ },
  { kind: "a test or hook time limit", pattern: /^\s*\}\s*,\s*[\d_]+\s*\);/ },
  { kind: "a sleep before a check", pattern: /setTimeout\(\s*\w+\s*,\s*[\d_]+\s*\)\);\s*$/ },
];

/** The unit tests: every test folder and its helpers. The Electron e2e suite runs in CI only, with its own waits. */
function testFiles(): string[] {
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

/** A sleep is fixed only when a check follows it; one in a polling loop just paces the loop. */
function findings(file: string, text: string): string[] {
  const lines = text.split(/\r?\n/);
  const found: string[] = [];
  lines.forEach((line, i) => {
    for (const { kind, pattern } of FIXED_WAITS) {
      if (!pattern.test(line)) continue;
      if (kind === "a sleep before a check" && !/^\s*expect\(/.test(lines[i + 1] ?? "")) continue;
      if (ALLOWED.some((a) => a.file === file && line.includes(a.line))) continue;
      found.push(`${file}:${i + 1}: ${kind}: ${line.trim()}`);
    }
  });
  return found;
}

describe("no unit test relies on a fixed wall-clock wait (BUG-28)", () => {
  it("finds each kind of fixed wait, so the guard below can't pass by seeing nothing", () => {
    const sample = [
      "await until(() => done, 20_000);",
      "await socket.next((f) => f.id === 1, 5000);",
      "await expect.poll(read, { timeout: 10_000 }).toBe(1);",
      "const end = Date.now() + 10_000;",
      'describe("x", { timeout: 60_000 }, () => {',
      "  { timeout: 60_000 },",
      "}, 60_000);",
      "await new Promise((r) => setTimeout(r, 300));",
      "expect(order).toEqual([]);",
      "while (!ok()) await new Promise((r) => setTimeout(r, 20));",
      "await until(() => done);",
    ].join("\n");
    expect(findings("sample.test.ts", sample).map((f) => f.split(": ")[1])).toEqual([
      "a deadline on a wait helper",
      "a deadline on a wait helper",
      "a deadline on expect.poll",
      "a deadline of its own",
      "a test or hook time limit",
      "a test or hook time limit",
      "a test or hook time limit",
      "a sleep before a check",
    ]);
  });

  it("finds none in the unit tests, outside the waits allowed for their reason", () => {
    const files = testFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap((f) => findings(f, readFileSync(join(REPO, f), "utf8")))).toEqual([]);
  });

  it("gives every test project the one hang guard, since vitest passes it on to none", () => {
    const root = readFileSync(join(REPO, "vitest.config.ts"), "utf8");
    const projects = [...(/projects:\s*\[([^\]]*)\]/.exec(root)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(projects.length).toBeGreaterThan(5);
    const unguarded = projects.filter((dir) => {
      const config = ["vitest.config.ts", "vite.config.ts"].map((f) => join(REPO, dir, f)).find((f) => existsSync(f));
      return !config || !/\.\.\.HANG_GUARD\b/.test(readFileSync(config, "utf8"));
    });
    expect(unguarded).toEqual([]);
  });

  it("allows each listed wait only where it still is", () => {
    const stale = ALLOWED.filter((a) => !readFileSync(join(REPO, a.file), "utf8").includes(a.line));
    expect(stale).toEqual([]);
  });
});
