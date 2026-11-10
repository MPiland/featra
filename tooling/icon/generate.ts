/**
 * Regenerates the app icon files in apps/desktop/assets from tooling/icon/icon.svg: `node tooling/icon/generate.ts`.
 * The tray icons (tray.png, tray@2x.png) are separate and untouched.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIcons } from "./render.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const sourceSvg = join(here, "icon.svg");
export const assetsDir = join(here, "../../apps/desktop/assets");

/** Writes every icon file into `out` and returns their paths. */
export function generate(out: string = assetsDir): string[] {
  mkdirSync(out, { recursive: true });
  return Object.entries(buildIcons(readFileSync(sourceSvg, "utf8"))).map(([name, bytes]) => {
    writeFileSync(join(out, name), bytes);
    return join(out, name);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const file of generate(process.argv[2])) process.stdout.write(`wrote ${file}\n`);
}
