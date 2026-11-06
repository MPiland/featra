import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectRegistry, findProject, projectRef, type FoundProject } from "../src/project-registry.ts";

/** Real registries against temporary folders: userData, and a place where project folders live. */
let userData: string;
let home: string;
beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), "featra-userdata-"));
  home = await mkdtemp(join(tmpdir(), "featra-home-"));
});
afterEach(async () => {
  await rm(userData, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

const folder = async (name: string) => {
  const dir = join(home, name);
  await mkdir(dir, { recursive: true });
  return dir;
};
const registry = (platform: string = process.platform) =>
  createProjectRegistry({ dir: userData, platform, fallbackLocation: home });
/** A registry as main starts one: load the list, then add what startup found. */
const started = async (found: FoundProject = { project: null, pinned: false }, platform?: string) => {
  const r = registry(platform);
  await r.start(found);
  return r;
};
const found = (dir: string, pinned = false): FoundProject => ({ project: projectRef(dir), pinned });
const names = async (r: Awaited<ReturnType<typeof started>>) => (await r.snapshot()).projects.map((p) => p.name);
const isDir = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

describe("the project found at startup", () => {
  it("is the nearest folder at or above the start folder that holds .featra", async () => {
    const project = await folder("manager");
    await mkdir(join(project, ".featra"));
    const nested = join(project, "apps", "desktop");
    await mkdir(nested, { recursive: true });
    expect(await findProject(nested)).toEqual({ project: { dir: project, name: "manager" }, pinned: false });
    expect(await findProject(project)).toEqual({ project: { dir: project, name: "manager" }, pinned: false });
  });

  it("is none when no folder above holds .featra", async () => {
    expect(await findProject(userData)).toEqual({ project: null, pinned: false });
  });

  it("FEATRA_PROJECT_DIR picks it and pins it; an empty value means none", async () => {
    const project = await folder("manager");
    expect(await findProject(userData, project)).toEqual({ project: { dir: project, name: "manager" }, pinned: true });
    expect(await findProject(project, "")).toEqual({ project: null, pinned: false });
  });
});

describe("STORY-19 AC1: the known projects", () => {
  it("start empty, with New Project… suggesting the fallback location", async () => {
    expect(await (await started()).snapshot()).toEqual({ current: null, projects: [], location: home });
  });

  it("add the project found at startup and make it current", async () => {
    const a = await folder("a");
    const r = await started(found(a));
    expect(await r.snapshot()).toEqual({
      current: { dir: a, name: "a" },
      projects: [{ dir: a, name: "a" }],
      location: home,
    });
  });

  it("are kept in projects.json; a restarted app reopens the project it was on, not the one it finds", async () => {
    const a = await folder("a");
    const b = await folder("b");
    const first = await started(found(a));
    await first.open(b);
    const saved = JSON.parse(await readFile(join(userData, "projects.json"), "utf8"));
    expect(saved).toMatchObject({ current: b, projects: [{ dir: a }, { dir: b }] });
    const again = await started(found(a));
    expect((await again.snapshot()).current?.dir).toBe(b);
    expect(await names(again)).toEqual(["a", "b"]);
  });

  it("FEATRA_PROJECT_DIR wins over the stored current project", async () => {
    const a = await folder("a");
    const b = await folder("b");
    await (await started(found(a))).open(b);
    expect((await (await started(found(a, true))).snapshot()).current?.dir).toBe(a);
  });

  it("leave out a folder that is gone, but keep it for when it comes back; a gone current falls back", async () => {
    const a = await folder("a");
    const b = await folder("b");
    await (await started(found(a))).open(b);
    await rm(b, { recursive: true });
    const r = await started(found(a));
    expect((await r.snapshot()).current?.dir).toBe(a);
    expect(await names(r)).toEqual(["a"]);
    await mkdir(b);
    expect(await names(r)).toEqual(["a", "b"]);
  });

  it("switch only to a known folder that is there", async () => {
    const a = await folder("a");
    const b = await folder("b");
    const r = await started(found(a));
    await r.open(b);
    expect(await r.switchTo(a)).toMatchObject({ ok: true, projects: { current: { dir: a } } });
    expect(r.current()?.dir).toBe(a);
    expect(await r.switchTo(join(home, "c"))).toEqual({ ok: false, error: "Not a known project." });
    expect(await r.switchTo(42)).toEqual({ ok: false, error: "Not a known project." });
    await rm(b, { recursive: true });
    expect(await r.switchTo(b)).toEqual({ ok: false, error: `Folder not found: ${b}` });
    expect(r.current()?.dir).toBe(a);
  });

  it("tell whether a folder is known: only those may have their settings read or written", async () => {
    const a = await folder("a");
    const r = await started(found(a));
    expect(r.has(a)).toBe(true);
    expect(r.has(home)).toBe(false);
    expect(r.has(undefined)).toBe(false);
  });
});

describe("STORY-19 AC2: Open Folder… and New Project…", () => {
  it("Open Folder… adds an existing folder once and makes it current", async () => {
    const a = await folder("a");
    const r = await started();
    expect(await r.open(a)).toMatchObject({ ok: true, projects: { current: { dir: a, name: "a" } } });
    await r.open(a);
    expect(await names(r)).toEqual(["a"]);
    expect(await r.open(join(home, "missing"))).toEqual({
      ok: false,
      error: `Folder not found: ${join(home, "missing")}`,
    });
    expect(await r.open("relative")).toEqual({ ok: false, error: "Folder not found: relative" });
  });

  it("compares folders without case on Windows and macOS, with case on Linux", async () => {
    const a = await folder("Proj");
    const upper = join(home.toUpperCase(), "PROJ");
    const win = await started(found(a), "win32");
    expect(win.has(upper)).toBe(true);
    const linux = createProjectRegistry({
      dir: await mkdtemp(join(tmpdir(), "featra-linux-")),
      platform: "linux",
      fallbackLocation: home,
    });
    await linux.start(found(a));
    expect(linux.has(upper)).toBe(false);
  });

  it("New Project… creates the folder in the location, adds it, makes it current and remembers the location", async () => {
    const r = await started();
    const result = await r.create(home, "  fresh  ");
    const dir = join(home, "fresh");
    expect(result).toEqual({
      ok: true,
      projects: { current: { dir, name: "fresh" }, projects: [{ dir, name: "fresh" }], location: home },
    });
    expect(await isDir(dir)).toBe(true);
    const parent = await folder("work");
    await r.create(parent, "second");
    expect((await (await started()).snapshot()).location).toBe(parent);
  });

  it("without a stored location, suggests the folder the current project is in", async () => {
    const parent = await folder("code");
    const a = join(parent, "a");
    await mkdir(a);
    expect((await (await started(found(a))).snapshot()).location).toBe(parent);
  });

  it("refuses a bad name, a missing location and a folder that is already there, and creates nothing", async () => {
    const r = await started();
    await folder("taken");
    expect(await r.create(home, "a/b")).toEqual({ ok: false, error: "A name can't contain \\ / : * ? \" < > |" });
    expect(await r.create(home, "NUL")).toEqual({ ok: false, error: "That name is reserved on Windows." });
    expect(await r.create(home, "")).toEqual({ ok: false, error: "Enter a name." });
    expect(await r.create(join(home, "nowhere"), "x")).toEqual({ ok: false, error: "Location not found." });
    expect(await r.create("relative", "x")).toEqual({ ok: false, error: "Location not found." });
    expect(await r.create(home, "taken")).toEqual({ ok: false, error: '"taken" already exists there.' });
    expect(await r.create(home, 7)).toEqual({ ok: false, error: "Enter a name." });
    expect(await names(r)).toEqual([]);
    expect(await isDir(join(home, "nowhere"))).toBe(false);
  });

  it("refuses a location that is a file", async () => {
    const file = join(home, "notes.txt");
    await writeFile(file, "x");
    expect(await (await started()).create(file, "x")).toEqual({ ok: false, error: "Location not found." });
  });
});

describe("the stored list", () => {
  it("a corrupt projects.json starts empty instead of breaking startup", async () => {
    await writeFile(join(userData, "projects.json"), "{ half", "utf8");
    const a = await folder("a");
    expect(await names(await started(found(a)))).toEqual(["a"]);
  });

  it("drops malformed entries", async () => {
    const a = await folder("a");
    await writeFile(
      join(userData, "projects.json"),
      JSON.stringify({ projects: [{ dir: a, name: "a" }, { dir: 3 }, null], current: a, lastLocation: 5 }),
    );
    const r = await started();
    expect(await r.snapshot()).toEqual({
      current: { dir: a, name: "a" },
      projects: [{ dir: a, name: "a" }],
      location: home,
    });
  });

  it("names a project after its folder", () => {
    expect(projectRef(join(home, "manager")).name).toBe("manager");
    expect(projectRef(join(home, "manager")).name).toBe(basename(join(home, "manager")));
  });
});
