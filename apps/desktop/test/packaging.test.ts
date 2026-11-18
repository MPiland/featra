import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_ID, builderConfig, icons, installerFiles, PRODUCT_NAME } from "../packaging/config.ts";
import { RUNTIME_PACKAGES } from "../packaging/runtime-packages.ts";
import { stageApp } from "../packaging/stage.ts";
import { clientIndex } from "../src/client-path.ts";

/**
 * STORY-64: what `pnpm package` builds, from the real electron-builder config and the real staging of the app folder.
 * Staging copies the Agent SDK from the workspace's installed packages; the built app is stood in for by small files.
 */
const DESKTOP = join(import.meta.dirname, "..");
const ASSETS = join(DESKTOP, "assets");
const desktopManifest = JSON.parse(readFileSync(join(DESKTOP, "package.json"), "utf8")) as {
  version: string;
  dependencies: Record<string, string>;
};
const config = builderConfig({ app: "/stage", output: "/out", assets: ASSETS, electronVersion: "45.2.2" });

/** electron-builder's file name macros, filled in as it does. */
const named = (pattern: string | null | undefined, arch: string, ext: string) =>
  (pattern ?? "")
    .replaceAll("${productName}", PRODUCT_NAME)
    .replaceAll("${version}", desktopManifest.version)
    .replaceAll("${arch}", arch)
    .replaceAll("${ext}", ext);

describe("the installers pnpm package builds (STORY-64)", () => {
  it("are named with the app's version and architecture, on each platform", () => {
    const v = desktopManifest.version;
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(installerFiles("win32", v)).toEqual([`Featra-${v}-x64-setup.exe`]);
    expect(installerFiles("darwin", v)).toEqual([`Featra-${v}-universal.dmg`, `Featra-${v}-universal.zip`]);
    expect(installerFiles("linux", v)).toEqual([`Featra-${v}-x64.AppImage`]);
    // The names electron-builder writes are the ones the package jobs and the smoke test look for.
    expect([named(config.nsis?.artifactName, "x64", "exe")]).toEqual(installerFiles("win32", v));
    expect([
      named(config.dmg?.artifactName, "universal", "dmg"),
      named(config.mac?.artifactName, "universal", "zip"),
    ]).toEqual(installerFiles("darwin", v));
    expect([named(config.appImage?.artifactName, "x64", "AppImage")]).toEqual(installerFiles("linux", v));
  });

  it("are a Windows x64 NSIS per-user installer, a universal macOS DMG and zip, and a Linux x64 AppImage", () => {
    expect(config.win?.target).toEqual([{ target: "nsis", arch: ["x64"] }]);
    expect(config.nsis).toMatchObject({ oneClick: true, perMachine: false });
    expect(config.mac?.target).toEqual([
      { target: "dmg", arch: ["universal"] },
      { target: "zip", arch: ["universal"] },
    ]);
    expect(config.linux?.target).toEqual([{ target: "AppImage", arch: ["x64"] }]);
    expect(config.publish).toBeNull();
  });

  it("ad-hoc signs the macOS app, with no Developer ID and no notarization", () => {
    expect(config.mac).toMatchObject({ identity: "-", hardenedRuntime: false, notarize: false });
  });

  it("names the app Featra and gives it, its installers and its shortcuts the Featra icon", () => {
    expect(config.productName).toBe("Featra");
    expect(config.appId).toBe(APP_ID);
    expect(config.nsis).toMatchObject({ shortcutName: "Featra", installerIcon: icons(ASSETS).win });
    expect(config.win?.icon).toBe(icons(ASSETS).win);
    expect(config.mac?.icon).toBe(icons(ASSETS).mac);
    expect(config.dmg?.icon).toBe(icons(ASSETS).mac);
    expect(config.linux?.icon).toBe(icons(ASSETS).linux);
    for (const file of Object.values(icons(ASSETS))) expect(existsSync(file), file).toBe(true);
  });
});

describe("the staged app folder (STORY-64)", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "featra-stage-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** A desktop folder with the real package.json and assets, and a stand-in for the built `dist/` and client. */
  async function builtApp() {
    const desktop = join(root, "desktop");
    await mkdir(join(desktop, "dist"), { recursive: true });
    await writeFile(join(desktop, "package.json"), readFileSync(join(DESKTOP, "package.json")));
    for (const name of ["main", "preload", "server", "mcp"]) await writeFile(join(desktop, "dist", `${name}.cjs`), "");
    await mkdir(join(desktop, "assets"));
    for (const name of await readdir(ASSETS))
      await writeFile(join(desktop, "assets", name), readFileSync(join(ASSETS, name)));
    const client = join(root, "client-dist");
    await mkdir(client);
    await writeFile(join(client, "index.html"), "<!doctype html>");
    return { desktop, client };
  }

  it("holds dist, the client where the installed app loads it, the assets, and a package.json named Featra", async () => {
    const { desktop, client } = await builtApp();
    const out = join(root, "app");
    const staged = await stageApp({ desktop, client, out, modulesFrom: DESKTOP });
    expect(staged.version).toBe(desktopManifest.version);
    for (const name of ["main", "preload", "server", "mcp"])
      expect(existsSync(join(out, "dist", `${name}.cjs`))).toBe(true);
    expect(existsSync(clientIndex({ appPath: out, packaged: true }))).toBe(true);
    expect(existsSync(join(out, "assets", "icon.png"))).toBe(true);
    // Electron names the installed app, and its userData folder, after productName.
    expect(JSON.parse(await readFile(join(out, "package.json"), "utf8"))).toEqual({
      name: "featra",
      productName: "Featra",
      version: desktopManifest.version,
      description: "Run your AI coding agents like a product team",
      author: "Mark Piland and Featra contributors",
      license: "MIT",
      main: "dist/main.cjs",
    });
  });

  it("carries the Agent SDK the app imports, at the locked version, and what it needs, but not Claude Code's binaries", async () => {
    const { desktop, client } = await builtApp();
    const out = join(root, "app");
    const staged = await stageApp({ desktop, client, out, modulesFrom: DESKTOP });
    const sdk = staged.packages.find((p) => p.name === "@anthropic-ai/claude-agent-sdk");
    expect(sdk).toEqual({
      name: "@anthropic-ai/claude-agent-sdk",
      version: desktopManifest.dependencies["@anthropic-ai/claude-agent-sdk"],
      at: "node_modules/@anthropic-ai/claude-agent-sdk",
    });
    expect(RUNTIME_PACKAGES).toEqual(["@anthropic-ai/claude-agent-sdk"]);
    expect(staged.packages.filter((p) => p.name.startsWith("@anthropic-ai/claude-agent-sdk-"))).toEqual([]);
    expect(await readdir(join(out, "node_modules", "@anthropic-ai"))).not.toContain("claude-agent-sdk-win32-x64");

    // The staged copy loads on its own, as the installed app's server imports it.
    const mod = (await import(
      pathToFileURL(join(out, "node_modules", "@anthropic-ai", "claude-agent-sdk", "sdk.mjs")).href
    )) as { query?: unknown; getSessionMessages?: unknown };
    expect(typeof mod.query).toBe("function");
    expect(typeof mod.getSessionMessages).toBe("function");
  });

  it("fails, naming the package, when a runtime package isn't installed", async () => {
    const { desktop, client } = await builtApp();
    await expect(stageApp({ desktop, client, out: join(root, "app"), modulesFrom: root })).rejects.toThrow(
      "@anthropic-ai/claude-agent-sdk isn't installed",
    );
  });
});
