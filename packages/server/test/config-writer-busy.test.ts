/**
 * BUG-44: on Windows a proof or check setting failed with "EPERM: operation not permitted, rename" while a scan had the
 * project's config open. The replace is tried again, as card writes are (BUG-16).
 */
import { readdir, readFile, rename as realRename } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configFile, writeConfigValue } from "../src/config-writer.ts";
import { tempFolder } from "./temp-folder.ts";

const folders: Awaited<ReturnType<typeof tempFolder>>[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((f) => f.dispose()));
});
const errno = (code: string) => Object.assign(new Error(code), { code });

describe("writeConfigValue on a config another program has open", () => {
  it("tries again after EPERM, and the value lands with no temporary file left", async () => {
    const f = await tempFolder();
    folders.push(f);
    let calls = 0;
    const result = await writeConfigValue(f.dir, "autoMerge", false, {
      rename: async (from, to) => {
        if (++calls === 1) throw errno("EPERM");
        await realRename(from, to);
      },
      pause: async () => {},
    });
    expect(result).toEqual({ error: null });
    expect(calls).toBe(2);
    expect(await readFile(configFile(f.dir), "utf8")).toMatch(/autoMerge: false/);
    expect(await readdir(join(f.dir, ".featra"))).toEqual(["config.yaml"]);
  });
});
