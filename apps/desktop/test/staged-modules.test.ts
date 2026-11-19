import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NOTICES_FILE, REPO_NOTICES, TERMS } from "../packaging/notices.ts";
import { LICENSE } from "../packaging/paths.ts";
import { stageApp, type StagedApp } from "../packaging/stage.ts";
import { builtApp, DESKTOP } from "./staged-app.ts";

/**
 * STORY-64: the installed app's `node_modules` as staging copies it from the workspace, with the real Agent SDK: only
 * what runs, the licences of all of it, and the SDK driving the user's `claude` without its own Claude Code binaries.
 */
const SDK = "@anthropic-ai/claude-agent-sdk";

let root: string;
let out: string;
let staged: StagedApp;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "featra-stage-"));
  const { desktop, client } = await builtApp(root);
  out = join(root, "app");
  staged = await stageApp({ desktop, client, out, modulesFrom: DESKTOP });
});
afterAll(() => rm(root, { recursive: true, force: true, maxRetries: 20 }));

/** Every file under `dir`, relative to it, with `/`. */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => relative(dir, join(e.parentPath, e.name)).replaceAll("\\", "/"));
}

/** Each package in a `node_modules` tree, found on disk: `<node_modules>/<name>/package.json`, scoped or not. */
async function packagesOnDisk(modules: string): Promise<{ name: string; version: string }[]> {
  const manifests = (await filesUnder(modules)).filter((f) =>
    /(^|\/node_modules\/)(@[^/]+\/)?[^/@][^/]*\/package\.json$/.test(f),
  );
  const found = await Promise.all(
    manifests.map(
      async (f) => JSON.parse(await readFile(join(modules, f), "utf8")) as { name?: string; version?: string },
    ),
  );
  return found.filter((m) => m.name && m.version).map((m) => ({ name: m.name!, version: m.version! }));
}

describe("the staged app's licences (STORY-64)", () => {
  it("carries Featra's own licence", async () => {
    expect(await readFile(join(out, "LICENSE"), "utf8")).toBe(await readFile(LICENSE, "utf8"));
  });

  it("names every package in its node_modules in the third-party notices, the repo's copy the same", async () => {
    const notices = await readFile(join(out, NOTICES_FILE), "utf8");
    const onDisk = await packagesOnDisk(join(out, "node_modules"));
    expect(onDisk.length).toBe(new Set(staged.packages.map((p) => p.at)).size);
    for (const { name, version } of onDisk)
      expect(notices, `${name} ${version}`).toContain(`\n## ${name} ${version}\n`);
    expect(notices).toBe(await readFile(REPO_NOTICES, "utf8"));
  });

  it("states the Agent SDK is Anthropic's, under its Commercial Terms, not an open licence", async () => {
    const notices = await readFile(join(out, NOTICES_FILE), "utf8");
    const sdk = notices.split("\n## ").find((s) => s.startsWith(`${SDK} `));
    expect(sdk).toContain(
      "© Anthropic PBC. All rights reserved. Use is subject to Anthropic's Commercial Terms of Service: " +
        "https://www.anthropic.com/legal/commercial-terms",
    );
    expect(sdk).toContain(TERMS[SDK]);
    expect(sdk).not.toMatch(/License: |MIT/);
    expect(JSON.parse(await readFile(join(out, "package.json"), "utf8")).license).not.toBe("MIT");
  });
});

describe("the staged node_modules (STORY-64)", () => {
  it("leaves out what nothing runs: types, source maps, readmes, changelogs and tests", async () => {
    const shipped = await filesUnder(join(out, "node_modules"));
    const unused = shipped.filter(
      (f) =>
        /\.d\.[cm]?ts$|\.map$/.test(f) ||
        /\/(test|tests|__tests__)\//.test(f) ||
        /\/(readme|changelog|history)(\.[^/]*)?$/i.test(f),
    );
    // A readme a package names as its licence stays.
    const named = await Promise.all(
      unused.map(async (f) => {
        const pkg = f.slice(0, f.lastIndexOf("/"));
        const manifest = join(out, "node_modules", pkg, "package.json");
        if (!existsSync(manifest)) return f;
        const license = (JSON.parse(await readFile(manifest, "utf8")) as { license?: string }).license ?? "";
        return license === `SEE LICENSE IN ${f.slice(pkg.length + 1)}` ? null : f;
      }),
    );
    expect(named.filter(Boolean)).toEqual([]);
    expect(shipped.some((f) => /\/licen[cs]e(\.[^/]*)?$/i.test(f))).toBe(true);
  });

  it("drives the user's claude with the staged Agent SDK, which looks for none of its own", async () => {
    const bin = await mkdtemp(join(tmpdir(), "featra-claude-"));
    try {
      const marker = join(bin, "started.json");
      const claude = join(bin, "claude.js");
      // The stand-in records that it was started, and with what, then exits.
      await writeFile(
        claude,
        `require("node:fs").writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)));\n`,
      );
      const sdk = (await import(pathToFileURL(join(out, "node_modules", SDK, "sdk.mjs")).href)) as {
        query: (input: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<unknown>;
      };
      let failure = "";
      try {
        for await (const _ of sdk.query({
          prompt: "hello",
          options: { pathToClaudeCodeExecutable: claude, cwd: bin },
        }));
      } catch (e) {
        failure = String(e);
      }
      expect(failure).not.toMatch(/claude-agent-sdk-/);
      expect(existsSync(marker), failure).toBe(true);
      expect(JSON.parse(await readFile(marker, "utf8"))).toEqual(expect.arrayContaining(["--output-format"]));
    } finally {
      await rm(bin, { recursive: true, force: true, maxRetries: 20 });
    }
  });
});
