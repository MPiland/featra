/** STORY-42: one-screen setup on the server, with real git in temporary folders (ADR 0013). */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SETUP_ITEMS, type SetupItemId } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { ApiError, createApi } from "../src/api.ts";
import { createGit } from "../src/git.ts";
import { setupStatus } from "../src/project-setup.ts";
import { setUpProject, setupPlan } from "../src/project-setup-plan.ts";
import { filesIn, tempFolder } from "./temp-folder.ts";

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

const ALL: SetupItemId[] = ["featra", "context", "decisions", "openQuestions", "adr", "gitignore"];
const nothingThere = ALL.map((id) => ({ id, exists: false }));
const content = (id: SetupItemId) => {
  const entry = SETUP_ITEMS.find((i) => i.id === id)?.entry;
  return entry?.kind === "file" ? entry.content : "";
};

describe("AC2: the plan says what the page offers and what is kept", () => {
  it("a plain folder: no git, nothing there", async () => {
    expect(await setupPlan(await folder(), git)).toEqual({ ok: true, git: false, items: nothingThere });
  });

  it("a repository with some files: git is there, and so are those files", async () => {
    const repo = await folder({ git: true });
    await writeFile(join(repo, "CONTEXT.md"), "# Ours\n");
    await writeFile(join(repo, ".gitignore"), "secret/\n");
    await mkdir(join(repo, "docs", "adr"), { recursive: true });
    const plan = await setupPlan(repo, git);
    expect(plan).toEqual({
      ok: true,
      git: true,
      items: ALL.map((id) => ({ id, exists: ["context", "gitignore", "adr"].includes(id) })),
    });
  });

  it("a file where docs/adr/ should be is not the folder", async () => {
    const repo = await folder({ git: true });
    await mkdir(join(repo, "docs"));
    await writeFile(join(repo, "docs", "adr"), "a file\n");
    const plan = await setupPlan(repo, git);
    expect(plan.ok && plan.items.find((i) => i.id === "adr")).toEqual({ id: "adr", exists: false });
  });

  it("a folder that is gone is an error", async () => {
    const gone = join(await folder(), "gone");
    expect(await setupPlan(gone, git)).toEqual({ ok: false, error: `Folder not found: ${gone}` });
  });
});

describe("AC3: one call sets the project up, git first", () => {
  it("a plain folder becomes a repository with .featra/ and the chosen files", async () => {
    const dir = await folder();
    const result = await setUpProject(dir, ["context", "adr", "gitignore"], git);
    expect(result).toEqual({
      ok: true,
      created: [".git/", ".featra/config.yaml", "CONTEXT.md", "docs/adr/", "docs/adr/README.md", ".gitignore"],
      kept: [],
    });
    expect(await setupStatus(dir, git)).toEqual({ state: "ready" });
    expect(await filesIn(dir)).toEqual(
      [".featra/config.yaml", ".gitignore", "CONTEXT.md", "docs/adr/README.md"].toSorted(),
    );
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(content("gitignore"));
  });

  it("the Featra folder is always set up, even when nothing is chosen", async () => {
    const repo = await folder({ git: true });
    expect(await setUpProject(repo, [], git)).toEqual({ ok: true, created: [".featra/config.yaml"], kept: [] });
  });

  it("an existing repository isn't initialised again", async () => {
    const repo = await folder({ git: true });
    const result = await setUpProject(repo, ["decisions"], git);
    expect(result).toEqual({ ok: true, created: [".featra/config.yaml", "decisions.md"], kept: [] });
  });

  it("through the API: refuses unknown items and folders that aren't open", async () => {
    const repo = await folder({ git: true });
    const allowed = createAllowedProjects();
    allowed.set([repo]);
    const api = createApi({ git, allowed });
    await expect(api("project.setup", { dir: repo, items: ["claude"] })).rejects.toThrow(ApiError);
    await expect(api("project.setup", { dir: repo })).rejects.toThrow("Expected { dir, items }.");
    await expect(api("project.setup", { dir: await folder(), items: [] })).rejects.toThrow("Not an open project.");
    expect(await api("project.setup", { dir: repo, items: ["context"] })).toEqual({
      ok: true,
      created: [".featra/config.yaml", "CONTEXT.md"],
      kept: [],
    });
    expect(await api("project.setupPlan", { dir: repo })).toMatchObject({ ok: true, git: true });
  });
});

describe("AC4: what was created and what was kept", () => {
  it("chosen items already there are kept, byte for byte", async () => {
    const repo = await folder({ git: true });
    await mkdir(join(repo, ".featra"));
    await writeFile(join(repo, ".featra", "config.yaml"), "progress: tasks\n");
    await writeFile(join(repo, "CONTEXT.md"), "# Ours\n");
    const result = await setUpProject(repo, ["context", "openQuestions"], git);
    expect(result).toEqual({ ok: true, created: ["open-questions.md"], kept: [".featra/config.yaml", "CONTEXT.md"] });
    expect(await readFile(join(repo, ".featra", "config.yaml"), "utf8")).toBe("progress: tasks\n");
    expect(await readFile(join(repo, "CONTEXT.md"), "utf8")).toBe("# Ours\n");
  });

  it("a write that fails is reported, not thrown", async () => {
    const repo = await folder({ git: true });
    await writeFile(join(repo, "docs"), "not a folder\n");
    const result = await setUpProject(repo, ["adr"], git);
    expect(result.ok ? "" : result.error).toMatch(/^Can't set up the project: /);
    expect(await readFile(join(repo, "docs"), "utf8")).toBe("not a folder\n");
  });
});

describe("AC5: never overwrites, never touches agent instruction files", () => {
  it("leaves the user's .gitignore alone, even if it is chosen", async () => {
    const repo = await folder({ git: true });
    await writeFile(join(repo, ".gitignore"), "secret/\n");
    const result = await setUpProject(repo, ALL, git);
    expect(result.ok && [...result.created, ...result.kept]).not.toContain(".gitignore");
    expect(await readFile(join(repo, ".gitignore"), "utf8")).toBe("secret/\n");
  });

  it("everything chosen, from a plain folder: no CLAUDE.md or AGENTS.md appears, the user's stay as they were", async () => {
    const dir = await folder();
    await writeFile(join(dir, "CLAUDE.md"), "# My Claude rules\n");
    await setUpProject(dir, ALL, git);
    expect(await readFile(join(dir, "CLAUDE.md"), "utf8")).toBe("# My Claude rules\n");
    expect((await filesIn(dir)).filter((f) => /(^|\/)agents\.md$/i.test(f))).toEqual([]);
  });
});
