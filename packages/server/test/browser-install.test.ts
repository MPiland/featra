/**
 * STORY-74: a feature nobody has checked out is served from a fresh checkout of its branch, which has no dependencies
 * installed: they are installed there first. A real project shape, with nothing faked: a feature branch holding a
 * package.json, its package-lock.json and a dependency the dev server needs, the real services, real npm, git and a
 * real dev server answering over HTTP.
 */
import { existsSync } from "node:fs";
import { get } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROOF_COPY } from "@featra/work-format";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

const CONFIG = "proof: preview\ndevServerCommand: node server.js {port}\ndevServerUrl: http://localhost:5173\n";
const GREETING = "hello from greeting";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The site: its dev server answers with what its dependency, `greeting`, says. */
async function site(tree: string) {
  await mkdir(join(tree, "vendor", "greeting"), { recursive: true });
  await writeFile(join(tree, "vendor", "greeting", "package.json"), json({ name: "greeting", version: "1.0.0" }));
  await writeFile(join(tree, "vendor", "greeting", "index.js"), `module.exports = ${JSON.stringify(GREETING)};\n`);
  const dependencies = { greeting: "file:vendor/greeting" };
  await writeFile(join(tree, "package.json"), json({ name: "site", version: "1.0.0", private: true, dependencies }));
  await writeFile(
    join(tree, "package-lock.json"),
    json({
      name: "site",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": { name: "site", version: "1.0.0", dependencies },
        "node_modules/greeting": { resolved: "vendor/greeting", link: true },
        "vendor/greeting": { name: "greeting", version: "1.0.0" },
      },
    }),
  );
  await writeFile(
    join(tree, "server.js"),
    'const greeting = require("greeting");\nrequire("node:http").createServer((_, res) => res.end(greeting)).listen(Number(process.argv[2]));\n',
  );
}

const body = (url: string) =>
  new Promise<string>((resolve, reject) => {
    get(url, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve(text));
    }).once("error", reject);
  });

let w: StoryWorld;

beforeAll(async () => {
  w = await storyWorld({ drafted: true, config: CONFIG });
  const branch = w.repo.git(w.dir, "for-each-ref", "--format=%(refname:short)", "refs/heads/feature/").trim();
  await w.repo.commitOn(branch, site, "the site");
  const confirmed = await w.window.ask("proof.set", { dir: w.dir, patch: { confirm: true } });
  if (!confirmed.ok) throw new Error("The dev server command wasn't confirmed.");
});
afterAll(() => w.close());

const start = (pane: string) => w.window.ask("browser.start", { dir: w.dir, id: "FEAT-2", pane });
const stop = (pane: string) => w.window.ask("browser.stop", { dir: w.dir, id: "FEAT-2", pane });

describe("A feature's preview checkout", () => {
  // Regression (STORY-74 review): the checkout had no node_modules, so the dev server never started.
  it("installs the dependencies its lockfile lists, then serves the feature", async () => {
    expect(await start("install:1")).toMatchObject({ ok: true, result: { installing: true } });
    const served = await start("install:1");
    expect(served).toMatchObject({ ok: true });
    const { url } = served.result as { url: string };
    expect(await body(url)).toBe(GREETING);
    const folder = w.repo
      .git(w.dir, "worktree", "list", "--porcelain")
      .split(/\r?\n/)
      .find((line) => line.includes("featra-feature-preview-"))
      ?.slice("worktree ".length);
    expect(folder && existsSync(join(folder, "node_modules", "greeting"))).toBe(true);
    expect(await stop("install:1")).toMatchObject({ ok: true });
    expect(folder && existsSync(folder)).toBe(false);
  });

  it("says why when the project's install command fails, and removes the checkout", async () => {
    const set = await w.window.ask("proof.set", {
      dir: w.dir,
      patch: { devServerInstall: "node -e \"console.error('registry unreachable'); process.exit(1)\"" },
    });
    expect(set).toMatchObject({ ok: true, result: { installUnconfirmed: false } });
    try {
      expect(await start("install:2")).toMatchObject({ ok: true, result: { installing: true } });
      const failed = await start("install:2");
      expect(failed).toMatchObject({ ok: false });
      expect(failed.error).toBe(`${PROOF_COPY.notes.installFailed}\nregistry unreachable`);
      expect(w.repo.git(w.dir, "worktree", "list")).not.toContain("featra-feature-preview-");
    } finally {
      await w.window.ask("proof.set", { dir: w.dir, patch: { devServerInstall: null } });
    }
  });

  it("doesn't run an install command changed outside Settings", async () => {
    await writeFile(join(w.dir, ".featra", "config.yaml"), `version: 1\n${CONFIG}devServerInstall: npm install\n`);
    const refused = await start("install:3");
    expect(refused).toMatchObject({ ok: false, error: PROOF_COPY.notes.installUnconfirmed });
    expect(w.repo.git(w.dir, "worktree", "list")).not.toContain("featra-feature-preview-");
  });
});
