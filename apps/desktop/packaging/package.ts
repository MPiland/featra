/**
 * `pnpm package`: builds the installer for the platform it runs on (STORY-64, ADR 0040) from the built app (the package
 * script builds it first). Stages the app folder in `out/app`, then electron-builder writes the installers to
 * `out/installers`, named by `installerFiles`.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import builder from "electron-builder";
import { builderConfig, installerFiles, isInstallerPlatform } from "./config.ts";
import { readManifest } from "./modules.ts";
import { DESKTOP, INSTALLERS, STAGED_APP } from "./paths.ts";
import { stageApp } from "./stage.ts";

/** The Electron the app is built and tested with: the workspace's own. */
export async function electronVersion(): Promise<string> {
  const require = createRequire(join(DESKTOP, "package.json"));
  return (await readManifest(dirname(require.resolve("electron/package.json")))).version;
}

async function main() {
  const platform = process.platform;
  if (!isInstallerPlatform(platform)) throw new Error(`Featra has no installer for ${platform}.`);
  const staged = await stageApp({
    desktop: DESKTOP,
    client: join(DESKTOP, "..", "..", "packages", "client", "dist"),
    out: STAGED_APP,
  });
  process.stdout.write(`Staged Featra ${staged.version} with ${staged.packages.length} runtime packages\n`);
  const config = builderConfig({
    app: STAGED_APP,
    output: INSTALLERS,
    assets: join(DESKTOP, "assets"),
    electronVersion: await electronVersion(),
  });
  // Run in the staged folder: from apps/desktop, electron-builder collects the workspace's dependencies itself, the
  // Agent SDK's Claude Code binaries among them, beside the staged node_modules.
  await builder.build({ projectDir: STAGED_APP, config, publish: "never" });
  for (const file of installerFiles(platform, staged.version))
    process.stdout.write(`Built ${join(INSTALLERS, file)}\n`);
}

if (process.argv[1] === import.meta.filename) await main();
