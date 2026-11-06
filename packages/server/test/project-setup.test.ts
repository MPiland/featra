import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FEATRA_SCAFFOLD, NEW_CONFIG, parseConfig } from "@featra/work-format";
import { createGit, GIT_MISSING } from "../src/git.ts";
import { initFeatra, initGit, setupStatus } from "../src/project-setup.ts";
import { filesIn, tempFolder } from "./temp-folder.ts";

/** Real git in temporary folders (ADR 0013): nothing about git is faked. */
const git = createGit();
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((c) => c()));
});
async function folder(opts: { git?: boolean } = {}) {
  const f = await tempFolder(opts);
  cleanups.push(f.dispose);
  return f.dir;
}

const SCAFFOLD_FILES = [
  ".featra/config.yaml",
  "CONTEXT.md",
  "decisions.md",
  "docs/adr/README.md",
  "open-questions.md",
].toSorted();

const ALL_CREATED = [
  ".featra/config.yaml",
  "CONTEXT.md",
  "docs/adr/",
  "docs/adr/README.md",
  "decisions.md",
  "open-questions.md",
];

describe("AC1: detecting git and .featra/", () => {
  it("a folder that is not a git repository needs git init", async () => {
    expect(await setupStatus(await folder(), git)).toEqual({ state: "no-git" });
  });

  it("a repository without .featra/ needs Featra init", async () => {
    expect(await setupStatus(await folder({ git: true }), git)).toEqual({ state: "no-featra" });
  });

  it("a subfolder of a repository is in that repository", async () => {
    const repo = await folder({ git: true });
    await mkdir(join(repo, "app"));
    expect(await setupStatus(join(repo, "app"), git)).toEqual({ state: "no-featra" });
  });

  it("a repository holding .featra/ is set up", async () => {
    const repo = await folder({ git: true });
    await mkdir(join(repo, ".featra"));
    expect(await setupStatus(repo, git)).toEqual({ state: "ready" });
  });

  it("a folder that is gone is an error, not an offer", async () => {
    const gone = join(await folder(), "gone");
    expect(await setupStatus(gone, git)).toEqual({ state: "error", error: `Folder not found: ${gone}` });
  });

  it("without git on the PATH, the status says how to fix it", async () => {
    expect(await setupStatus(await folder(), createGit("featra-no-such-git"))).toEqual({
      state: "error",
      error: GIT_MISSING,
    });
  });

  it("git's hook variables don't make another folder look like that repository", async () => {
    const repo = await folder({ git: true });
    const plain = await folder();
    const before = process.env.GIT_DIR;
    process.env.GIT_DIR = join(repo, ".git");
    try {
      expect(await setupStatus(plain, git)).toEqual({ state: "no-git" });
    } finally {
      if (before === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = before;
    }
  });
});

describe("AC1: git init", () => {
  it("makes the folder a repository, which then needs Featra init", async () => {
    const dir = await folder();
    expect(await initGit(dir, git)).toEqual({ state: "no-featra" });
    expect(await setupStatus(dir, git)).toEqual({ state: "no-featra" });
  });

  it("leaves an existing repository alone", async () => {
    const repo = await folder({ git: true });
    await writeFile(join(repo, ".git", "description"), "mine\n");
    expect(await initGit(repo, git)).toEqual({ state: "no-featra" });
    expect(await readFile(join(repo, ".git", "description"), "utf8")).toBe("mine\n");
  });
});

describe("AC2: Featra init scaffolds what is missing and never overwrites", () => {
  it("creates .featra/config.yaml, CONTEXT.md, docs/adr/, decisions.md and open-questions.md", async () => {
    const repo = await folder({ git: true });
    expect(await initFeatra(repo, git)).toEqual({ ok: true, created: ALL_CREATED, kept: [] });
    expect(await filesIn(repo)).toEqual(SCAFFOLD_FILES);
    for (const entry of FEATRA_SCAFFOLD.flatMap((e) => (e.kind === "file" ? [e] : []))) {
      expect(await readFile(join(repo, entry.path), "utf8")).toBe(entry.content);
    }
    expect(await setupStatus(repo, git)).toEqual({ state: "ready" });
  });

  it("writes a config with only the version, so the app-wide work defaults apply", async () => {
    const repo = await folder({ git: true });
    await initFeatra(repo, git);
    const text = await readFile(join(repo, ".featra", "config.yaml"), "utf8");
    expect(text).toBe(NEW_CONFIG);
    expect(parseConfig(text).version).toBe(1);
  });

  it("keeps every file and folder that is already there, byte for byte", async () => {
    const repo = await folder({ git: true });
    await mkdir(join(repo, ".featra"));
    await writeFile(join(repo, ".featra", "config.yaml"), "progress: tasks\n");
    await writeFile(join(repo, "CONTEXT.md"), "# Our words\n");
    await writeFile(join(repo, "decisions.md"), "- we chose X\n");
    await mkdir(join(repo, "docs", "adr"), { recursive: true });
    await writeFile(join(repo, "docs", "adr", "0001-ours.md"), "# 0001\n");
    expect(await initFeatra(repo, git)).toEqual({
      ok: true,
      created: ["open-questions.md"],
      kept: [".featra/config.yaml", "CONTEXT.md", "docs/adr/", "decisions.md"],
    });
    expect(await readFile(join(repo, ".featra", "config.yaml"), "utf8")).toBe("progress: tasks\n");
    expect(await readFile(join(repo, "CONTEXT.md"), "utf8")).toBe("# Our words\n");
    expect(await readFile(join(repo, "decisions.md"), "utf8")).toBe("- we chose X\n");
    // The user's own ADR folder gets nothing added to it.
    expect(await filesIn(join(repo, "docs", "adr"))).toEqual(["0001-ours.md"]);
  });

  it("run again, it creates nothing and keeps everything", async () => {
    const repo = await folder({ git: true });
    await initFeatra(repo, git);
    await writeFile(join(repo, "CONTEXT.md"), "# Edited since\n");
    expect(await initFeatra(repo, git)).toEqual({
      ok: true,
      created: [],
      kept: [".featra/config.yaml", "CONTEXT.md", "docs/adr/", "decisions.md", "open-questions.md"],
    });
    expect(await readFile(join(repo, "CONTEXT.md"), "utf8")).toBe("# Edited since\n");
  });

  it("refuses a folder that is not a repository, and writes nothing", async () => {
    const dir = await folder();
    expect(await initFeatra(dir, git)).toEqual({ ok: false, error: "Initialize git in this folder first." });
    expect(await filesIn(dir)).toEqual([]);
  });

  it("reports a file in the way of a folder instead of throwing, and leaves the file alone", async () => {
    const repo = await folder({ git: true });
    await writeFile(join(repo, "docs"), "not a folder\n");
    const result = await initFeatra(repo, git);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/^Can't initialize Featra: /);
    expect(await readFile(join(repo, "docs"), "utf8")).toBe("not a folder\n");
  });
});

describe("AC3: init never creates or edits agent instruction files", () => {
  it("leaves CLAUDE.md and AGENTS.md exactly as they were", async () => {
    const repo = await folder({ git: true });
    await writeFile(join(repo, "CLAUDE.md"), "# My Claude rules\n");
    await writeFile(join(repo, "AGENTS.md"), "# My agent rules\n");
    await initFeatra(repo, git);
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe("# My Claude rules\n");
    expect(await readFile(join(repo, "AGENTS.md"), "utf8")).toBe("# My agent rules\n");
  });

  it("creates neither file when the project has none, through git init and Featra init", async () => {
    const dir = await folder();
    await initGit(dir, git);
    await initFeatra(dir, git);
    const files = await filesIn(dir);
    expect(files.filter((f) => /(^|\/)(claude|agents)\.md$/i.test(f))).toEqual([]);
    expect(files).toEqual(SCAFFOLD_FILES);
  });
});
