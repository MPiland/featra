import { mkdir, readdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** apps/desktop, and its assets. */
export const DESKTOP = join(import.meta.dirname, "..");
export const ASSETS = join(DESKTOP, "assets");

/**
 * A desktop folder in `root` with the real package.json and assets, and a stand-in for the built `dist/` and client:
 * what staging (packaging/stage.ts) copies from.
 */
export async function builtApp(root: string) {
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
