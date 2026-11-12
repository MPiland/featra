/**
 * STORY-56: where checks run (GitHub detection with a fake `gh` on the PATH) and Project settings' Checks section.
 * Real repository, real files and the real config writer; only `gh` is a stand-in.
 */
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHECKS_COPY, parseConfig } from "@featra/work-format";
import { createCheckSettings, type CheckSettings } from "../src/check-settings.ts";
import { writeConfigValue } from "../src/config-writer.ts";
import { detectGithub } from "../src/github-detect.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { cardRepo, type CardRepo } from "./card-repo.ts";

const win = process.platform === "win32";
let repo: CardRepo;
let bin: string;
let savedPath: string | undefined;

/** A `gh` on the PATH that answers `repo view` with `stdout` and `code`, and notes each call in `calls.log`. */
async function fakeGh(stdout: string, code = 0) {
  await writeFile(join(bin, "answer.txt"), stdout);
  const calls = join(bin, "calls.log");
  if (win) {
    await writeFile(
      join(bin, "gh.cmd"),
      `@echo off\r\necho %* >> "${calls}"\r\ntype "%~dp0answer.txt"\r\nexit /b ${code}\r\n`,
    );
  } else {
    const script = join(bin, "gh");
    await writeFile(script, `#!/bin/sh\necho "$@" >> "${calls}"\ncat "$(dirname "$0")/answer.txt"\nexit ${code}\n`);
    await chmod(script, 0o755);
  }
}
const ghCalls = async () =>
  (await readFile(join(bin, "calls.log"), "utf8").catch(() => ""))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

async function onGithub(workflows = true) {
  repo.git(repo.main, "remote", "add", "origin", "https://github.com/acme/app.git");
  if (workflows) {
    await mkdir(join(repo.main, ".github", "workflows"), { recursive: true });
    await writeFile(join(repo.main, ".github", "workflows", "ci.yml"), "name: ci\n");
  }
}

beforeEach(async () => {
  repo = await cardRepo();
  bin = await mkdtemp(join(tmpdir(), "featra-gh-"));
  savedPath = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${savedPath ?? ""}`;
});
afterEach(async () => {
  process.env.PATH = savedPath;
  await rm(bin, { recursive: true, force: true });
  await repo.dispose();
});

describe("GitHub detection (AC1)", () => {
  it("finds a GitHub remote, workflows and a public repo through gh", async () => {
    await onGithub();
    await fakeGh('{"visibility":"PUBLIC"}');
    expect(await detectGithub(repo.main)).toEqual({ remote: true, workflows: true, public: true });
    expect(await ghCalls()).toEqual(["repo view --json visibility"]);
  });

  it("finds a private repo", async () => {
    await onGithub();
    await fakeGh('{"visibility":"PRIVATE"}');
    expect(await detectGithub(repo.main)).toMatchObject({ public: false });
  });

  it("reads visibility as unknown when gh fails (signed out) or answers nonsense", async () => {
    await onGithub();
    await fakeGh("not signed in", 1);
    expect(await detectGithub(repo.main)).toMatchObject({ remote: true, public: null });
    await fakeGh("{}");
    expect(await detectGithub(repo.main)).toMatchObject({ public: null });
  });

  it("reads visibility as unknown when there is no gh", async () => {
    await onGithub();
    expect(await detectGithub(repo.main, { ghCommand: "gh-that-is-not-installed" })).toMatchObject({ public: null });
  });

  it("runs a gh whose path has a space in it, and refuses one with a quote in it", async () => {
    if (!win) return;
    await onGithub();
    const spaced = join(bin, "with space");
    await mkdir(spaced);
    await writeFile(join(spaced, "gh.cmd"), '@echo off\r\necho {"visibility":"PUBLIC"}\r\n');
    expect(await detectGithub(repo.main, { ghCommand: join(spaced, "gh.cmd") })).toMatchObject({ public: true });
    expect(await detectGithub(repo.main, { ghCommand: 'gh" & echo x & "' })).toMatchObject({ public: null });
  });

  it("has no remote or no workflows without asking gh anything it doesn't need", async () => {
    await fakeGh('{"visibility":"PUBLIC"}');
    expect(await detectGithub(repo.main)).toEqual({ remote: false, workflows: false, public: null });
    expect(await ghCalls()).toEqual([]);
    repo.git(repo.main, "remote", "add", "origin", "git@gitlab.com:acme/app.git");
    expect(await detectGithub(repo.main)).toMatchObject({ remote: false });
    repo.git(repo.main, "remote", "set-url", "origin", "git@github.com:acme/app.git");
    expect(await detectGithub(repo.main)).toMatchObject({ remote: true, workflows: false });
  });
});

const configFile = () => join(repo.main, ".featra", "config.yaml");
const setCommand = (command: string) =>
  writeFile(configFile(), `version: 1\ncheckCommand: ${JSON.stringify(command)}\n`);

describe("Project settings' Checks section (AC1, AC2)", () => {
  let settings: CheckSettings;
  const scanner = createScanner(createRepoGit());
  beforeEach(() => {
    settings = createCheckSettings({ scan: scanner.scan, now: () => new Date("2026-11-12T10:00:00Z") });
  });
  afterEach(() => scanner.close());

  it("defaults to CI for a public GitHub repo with workflows, and says why", async () => {
    await onGithub();
    await fakeGh('{"visibility":"PUBLIC"}');
    expect(await settings.load(repo.main)).toMatchObject({ where: "ci", chosen: false, reason: CHECKS_COPY.ci });
  });

  it("defaults to this computer for a private repo", async () => {
    await onGithub();
    await fakeGh('{"visibility":"PRIVATE"}');
    expect(await settings.load(repo.main)).toMatchObject({
      where: "local",
      chosen: false,
      reason: CHECKS_COPY.notPublic,
    });
  });

  it("says it couldn't tell when gh fails or is missing, and runs on this computer", async () => {
    await onGithub();
    await fakeGh("not signed in", 1);
    expect(await settings.load(repo.main)).toMatchObject({
      where: "local",
      chosen: false,
      reason: CHECKS_COPY.unknown,
    });
    const none = createCheckSettings({
      scan: scanner.scan,
      now: () => new Date(),
      ghCommand: "gh-that-is-not-installed",
    });
    expect(await none.load(repo.main)).toMatchObject({ where: "local", reason: CHECKS_COPY.unknown });
    expect(CHECKS_COPY.unknown).toBe("Couldn't tell if it's public on GitHub, so checks run on this computer.");
  });

  it("defaults to this computer without GitHub", async () => {
    expect(await settings.load(repo.main)).toMatchObject({ where: "local", reason: CHECKS_COPY.noGithub });
  });

  it("keeps the user's choice, in the project's config, over the default", async () => {
    await settings.set(repo.main, { where: "ci" });
    expect(await settings.load(repo.main)).toMatchObject({ where: "ci", chosen: true, reason: "" });
    expect(parseConfig(await readFile(join(repo.main, ".featra", "config.yaml"), "utf8")).checksWhere).toBe("ci");
    await settings.set(repo.main, { where: null });
    expect(await settings.load(repo.main)).toMatchObject({ where: "local", chosen: false });
  });

  it("proposes the test script of package.json through the lockfile's package manager", async () => {
    await writeFile(
      join(repo.main, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { vitest: "1" } }),
    );
    await writeFile(join(repo.main, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
    const view = await settings.load(repo.main);
    expect(view.command).toBeNull();
    expect(view.proposals).toEqual([
      { field: "command", value: "pnpm test", source: "package.json" },
      {
        field: "testCommand",
        value: "pnpm exec vitest run {file} -t {namePattern} --reporter=junit --outputFile={report}",
        source: "package.json",
      },
    ]);
  });

  it("applies nothing until the user confirms, and a confirmed value is no longer proposed", async () => {
    await writeFile(join(repo.main, "package.json"), JSON.stringify({ scripts: { test: "node t.js" } }));
    const proposed = await settings.load(repo.main);
    expect(proposed.proposals).toHaveLength(1);
    expect(proposed.command).toBeNull();
    const config = () => readFile(join(repo.main, ".featra", "config.yaml"), "utf8");
    expect(await config()).not.toContain("checkCommand");
    const confirmed = await settings.set(repo.main, { command: "npm test -- --run" });
    expect(confirmed).toMatchObject({ command: "npm test -- --run", error: null });
    expect(parseConfig(await config()).checkCommand).toBe("npm test -- --run");
    expect(confirmed.proposals).toEqual([{ field: "command", value: "npm test", source: "package.json" }]);
  });

  it("shows the Dev Lead's proposal beside the files', never applies it, and drops it once the user sets the field", async () => {
    await settings.propose(repo.main, "command", "pnpm run check");
    const view = await settings.load(repo.main);
    expect(view.proposals).toEqual([{ field: "command", value: "pnpm run check", source: "dev-lead" }]);
    expect(view.command).toBeNull();
    const after = await settings.set(repo.main, { command: "pnpm run check:all" });
    expect(after.proposals).toEqual([]);
  });

  it("keeps a proposal in the app's data folder across restarts", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "featra-data-"));
    try {
      const deps = { scan: scanner.scan, now: () => new Date(), dataDir };
      await createCheckSettings(deps).propose(repo.main, "testCommand", "npx vitest run {file}");
      expect((await createCheckSettings(deps).load(repo.main)).proposals).toEqual([
        { field: "testCommand", value: "npx vitest run {file}", source: "dev-lead" },
      ]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  describe("a command that git changed in the project's config", () => {
    it("is shown as changed and is not one that runs, until the user confirms it", async () => {
      await setCommand("node evil.js");
      const view = await settings.load(repo.main);
      expect(view).toMatchObject({ command: "node evil.js", unconfirmed: ["command"] });
      const config = (await scanner.scan(repo.main))?.collected.config;
      expect(config && (await settings.confirmed(repo.main, config))).toMatchObject({ command: null });
      const after = await settings.set(repo.main, { confirm: ["command"] });
      expect(after.unconfirmed).toEqual([]);
      const again = (await scanner.scan(repo.main))?.collected.config;
      expect(again && (await settings.confirmed(repo.main, again))).toMatchObject({ command: "node evil.js" });
    });

    it("is changed again when the file holds a different command from the confirmed one", async () => {
      await settings.set(repo.main, { command: "pnpm test", testCommand: "run {file} {report}" });
      expect((await settings.load(repo.main)).unconfirmed).toEqual([]);
      await writeFile(
        configFile(),
        "version: 1\ncheckCommand: pnpm test && curl evil\nlinkedTestCommand: run {file} {report}\n",
      );
      expect((await settings.load(repo.main)).unconfirmed).toEqual(["command"]);
      const config = (await scanner.scan(repo.main))?.collected.config;
      expect(config && (await settings.confirmed(repo.main, config))).toMatchObject({
        command: null,
        testCommand: "run {file} {report}",
      });
    });

    it("is trusted once the user saves a value in Project settings, which is what they typed", async () => {
      const view = await settings.set(repo.main, { command: "pnpm run check" });
      expect(view).toMatchObject({ command: "pnpm run check", unconfirmed: [] });
    });

    it("keeps what the user confirmed in the app's data folder across restarts", async () => {
      const dataDir = await mkdtemp(join(tmpdir(), "featra-data-"));
      try {
        const deps = { scan: scanner.scan, now: () => new Date(), dataDir };
        await createCheckSettings(deps).set(repo.main, { command: "pnpm test" });
        expect((await createCheckSettings(deps).load(repo.main)).unconfirmed).toEqual([]);
        expect((await createCheckSettings({ ...deps, dataDir: undefined }).load(repo.main)).unconfirmed).toEqual([
          "command",
        ]);
      } finally {
        await rm(dataDir, { recursive: true, force: true });
      }
    });
  });

  it("refuses a command that is empty, has a line break or is too long, and changes nothing", async () => {
    for (const command of ["", "a\nb", "x".repeat(1001)]) {
      const view = await settings.set(repo.main, { command });
      expect(view.error).toMatch(/checkCommand must be one line/);
      expect(view.command).toBeNull();
    }
  });

  it("is refused for a folder that is not a Featra project", async () => {
    const view = await settings.load(join(repo.root, "nowhere"));
    expect(view.error).toBe(CHECKS_COPY.notFeatra);
  });
});

describe("the config writer", () => {
  it("edits the key in place, keeping comments and other keys", async () => {
    const file = join(repo.main, ".featra", "config.yaml");
    await writeFile(file, "version: 1\n# how we work\nprogress: tasks\n");
    expect(await writeConfigValue(repo.main, "checkCommand", "npm test")).toEqual({ error: null });
    expect(await readFile(file, "utf8")).toBe("version: 1\n# how we work\nprogress: tasks\ncheckCommand: npm test\n");
    expect(await writeConfigValue(repo.main, "checkCommand", null)).toEqual({ error: null });
    expect(await readFile(file, "utf8")).toBe("version: 1\n# how we work\nprogress: tasks\n");
  });

  it("leaves a file it can't read as a config alone and says why", async () => {
    const file = join(repo.main, ".featra", "config.yaml");
    await writeFile(file, "progress: nonsense\n");
    expect((await writeConfigValue(repo.main, "checkCommand", "npm test")).error).toMatch(/progress must be/);
    expect(await readFile(file, "utf8")).toBe("progress: nonsense\n");
  });

  it("keeps quick changes in order", async () => {
    await Promise.all(["a", "b", "c"].map((c) => writeConfigValue(repo.main, "checkCommand", c)));
    expect(parseConfig(await readFile(join(repo.main, ".featra", "config.yaml"), "utf8")).checkCommand).toBe("c");
  });
});
