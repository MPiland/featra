/**
 * The GitHub CLI faked for the story PR tests (STORY-11): `fake-gh.cjs` behind a `gh` (or `gh.cmd`) in a temp folder,
 * with its GitHub in a JSON file the test reads and changes. Never the real `gh`, nor its login.
 */
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const FAKE_GH_SCRIPT = fileURLToPath(new URL("fake-gh.cjs", import.meta.url));

export interface FakePr {
  number: number;
  url: string;
  head: string;
  base?: string;
  title?: string;
  body?: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft?: boolean;
  /** `statusCheckRollup` as `gh pr view` gives it. */
  checks?: unknown[];
  /** The checks of each head commit, in place of `checks`: a new push starts with none, as on GitHub. */
  checksAt?: Record<string, unknown[]>;
  /** The names of the checks the repo requires; none by default. */
  required?: string[];
  /** The owner of a fork the PR comes from; the repo's own owner by default. */
  headOwner?: string;
}

export interface FakeGhState {
  signedIn: boolean;
  prs: FakePr[];
  next: number;
  /** When set, opening a PR fails with this message. */
  createFails?: string;
  /** The bare repository that stands in for GitHub's copy: a PR's head commit is its branch's tip there. */
  remote?: string;
  /** A file written while the PR opens, as a user editing the card meanwhile would. */
  whileCreating?: { file: string; text: string };
  /** How long `gh pr view` takes to answer. */
  viewDelayMs?: number;
  /** The repo's workflow runs (STORY-57). */
  runs?: FakeRun[];
  /** When set, downloading an artifact fails with this message. */
  downloadFails?: string;
}

/** A workflow run of one commit, with its artifacts: each a map of a file's path inside it to the file's text. */
export interface FakeRun {
  id: number;
  headSha: string;
  /** `completed` by default. */
  status?: "queued" | "in_progress" | "waiting" | "requested" | "pending" | "completed";
  artifacts?: Record<string, Record<string, string>>;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A JUnit report as vitest writes one: each test is `[file, full name with " > ", "passed" | "failed" | "skipped"]`. */
export function junitXml(tests: readonly (readonly [string, string, "passed" | "failed" | "skipped"])[]): string {
  const cases = tests.map(([file, name, status]) => {
    const inner =
      status === "failed"
        ? `<failure message="expected true" type="AssertionError">at line 3</failure>`
        : status === "skipped"
          ? "<skipped/>"
          : "";
    return `    <testcase classname="${esc(file)}" name="${esc(name)}" time="0.01">${inner}</testcase>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" ?>\n<testsuites name="vitest tests" tests="${tests.length}">\n  <testsuite name="tests">\n${cases.join("\n")}\n  </testsuite>\n</testsuites>\n`;
}

export interface GhCall {
  args: string[];
  input: string;
}

/** A check run as `statusCheckRollup` lists it. */
export const checkRun = (conclusion: string | null, name = "ci") => ({
  __typename: "CheckRun",
  name,
  status: conclusion === null ? "IN_PROGRESS" : "COMPLETED",
  conclusion: conclusion ?? "",
});

/** Writes the wrapper for this platform, which runs the script with `node` and the state file named. */
export async function writeGhWrapper(bin: string, script = FAKE_GH_SCRIPT) {
  const state = join(bin, "gh-state.json");
  if (process.platform === "win32") {
    const path = join(bin, "gh.cmd");
    await writeFile(path, `@echo off\r\nset "FAKE_GH_STATE=%~dp0gh-state.json"\r\nnode "${script}" %*\r\n`);
    return { command: path, state };
  }
  const path = join(bin, "gh");
  await writeFile(path, `#!/bin/sh\nFAKE_GH_STATE="$(dirname "$0")/gh-state.json" exec node "${script}" "$@"\n`);
  await chmod(path, 0o755);
  return { command: path, state };
}

export async function fakeGh(initial: Partial<FakeGhState> = {}) {
  const bin = await mkdtemp(join(tmpdir(), "featra-gh-"));
  const { command, state } = await writeGhWrapper(bin);
  const save = (s: FakeGhState) => writeFile(state, JSON.stringify(s, null, 2));
  await save({ signedIn: true, prs: [], next: 1, ...initial });
  const load = async (): Promise<FakeGhState> => JSON.parse(await readFile(state, "utf8")) as FakeGhState;
  return {
    bin,
    /** The `gh` to give the server as `ghCommand`. */
    command,
    load,
    /** Changes the fake GitHub. */
    async change(edit: (s: FakeGhState) => void) {
      const s = await load();
      edit(s);
      await save(s);
    },
    /** Every call so far, in order. */
    async calls(): Promise<GhCall[]> {
      const text = await readFile(`${state}.calls`, "utf8").catch(() => "");
      return text
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as GhCall);
    },
    dispose: () => rm(bin, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }),
  };
}

export type FakeGh = Awaited<ReturnType<typeof fakeGh>>;
