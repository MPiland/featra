import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PACKAGED_CLIENT_DIR } from "../src/client-path.ts";
import { PRODUCT_NAME } from "./config.ts";
import { copyPackages, readManifest, type CopiedPackage, type Manifest } from "./modules.ts";
import { RUNTIME_PACKAGES } from "./runtime-packages.ts";

/**
 * The app folder electron-builder packages (ADR 0040, STORY-64), built from the workspace's own build without changing
 * it: Vite's `dist/` (main, preload, server, MCP), the client's build in `client/`, the assets, a package.json, and
 * `node_modules` with only the Agent SDK and what it needs at run time, since everything else is bundled into `dist/`.
 */

export interface StageInput {
  /** apps/desktop: its package.json, its built `dist/` and `assets/`. */
  desktop: string;
  /** The client's build (packages/client/dist). */
  client: string;
  /** The folder to stage into; emptied first. */
  out: string;
  /** Where the Agent SDK is looked up from; the desktop folder unless a test says otherwise. */
  modulesFrom?: string;
}

export interface StagedApp {
  version: string;
  packages: CopiedPackage[];
}

/**
 * The staged package.json. Its name is the product's, so the installed app's userData folder is `Featra` (app-name.ts),
 * and it declares no dependencies: electron-builder installs and collects nothing, and packages the folder as it is.
 */
export const stagedManifest = (desktop: Manifest) => ({
  name: PRODUCT_NAME.toLowerCase(),
  productName: PRODUCT_NAME,
  version: desktop.version,
  description: "Run your AI coding agents like a product team",
  author: "Mark Piland and Featra contributors",
  license: desktop.license,
  main: desktop.main,
});

export async function stageApp({ desktop, client, out, modulesFrom = desktop }: StageInput): Promise<StagedApp> {
  const manifest = await readManifest(desktop);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(join(desktop, "dist"), join(out, "dist"), { recursive: true });
  await cp(client, join(out, PACKAGED_CLIENT_DIR), { recursive: true });
  await cp(join(desktop, "assets"), join(out, "assets"), { recursive: true });
  await writeFile(join(out, "package.json"), `${JSON.stringify(stagedManifest(manifest), null, 2)}\n`);
  const packages = await copyPackages(modulesFrom, RUNTIME_PACKAGES, join(out, "node_modules"));
  return { version: manifest.version, packages };
}
