/**
 * STORY-63: a settings save that Windows refuses while another program reads `settings.json` is tried again, not
 * lost. Settings > General's Close button showed "Minimize to tray" while the file kept "quit" (E2E (Windows), run
 * 44382861691), because the store's rename failed once with EPERM and nothing tried it again.
 */
import { open, readdir, readFile, rename as realRename } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createJsonStore } from "../src/json-store.ts";
import { tempFolder } from "./temp-folder.ts";

const folders: Awaited<ReturnType<typeof tempFolder>>[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((f) => f.dispose()));
});
async function folder() {
  const f = await tempFolder();
  folders.push(f);
  return f.dir;
}
const errno = (code: string) => Object.assign(new Error(code), { code });
const asIs = (raw: unknown) => (raw ?? {}) as { closeButton?: string };

describe("a JSON store saving a file another program has open (STORY-63)", () => {
  it("tries the rename again after EPERM and EBUSY, and the new value lands", async () => {
    const dir = await folder();
    let calls = 0;
    const store = createJsonStore(dir, "settings.json", asIs, {
      rename: async (from, to) => {
        if (++calls <= 2) throw errno(calls === 1 ? "EPERM" : "EBUSY");
        await realRename(from, to);
      },
      pause: async () => {},
    });
    await store.save({ closeButton: "tray" });
    expect(calls).toBe(3);
    expect(await store.load()).toEqual({ closeButton: "tray" });
    expect(await readdir(dir)).toEqual(["settings.json"]);
  });

  it("saves while a reader holds the real file open, once the reader lets go", async () => {
    const dir = await folder();
    const store = createJsonStore(dir, "settings.json", asIs);
    await store.save({ closeButton: "quit" });
    const reader = await open(join(dir, "settings.json"), "r");
    const saved = store.save({ closeButton: "tray" });
    setTimeout(() => void reader.close(), 30);
    await saved;
    expect(JSON.parse(await readFile(join(dir, "settings.json"), "utf8"))).toEqual({ closeButton: "tray" });
  });
});
