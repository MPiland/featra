/** BUG-16: a card write that Windows refuses while a scan or scanner holds the file is tried again, not lost. */
import { readdir, readFile, rename as realRename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeAtomic } from "../src/card-actions.ts";
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

describe("writeAtomic on a file another program has open", () => {
  it("tries again after EPERM and EBUSY, and the new text lands", async () => {
    const dir = await folder();
    const file = join(dir, "STORY-1.md");
    await writeFile(file, "old", "utf8");
    let calls = 0;
    await writeAtomic(file, "new", {
      rename: async (from, to) => {
        if (++calls <= 2) throw errno(calls === 1 ? "EPERM" : "EBUSY");
        await realRename(from, to);
      },
      pause: async () => {},
    });
    expect(calls).toBe(3);
    expect(await readFile(file, "utf8")).toBe("new");
    expect(await readdir(dir)).toEqual(["STORY-1.md"]);
  });

  it("gives up after a few tries with the error, leaves the old text and no temporary file", async () => {
    const dir = await folder();
    const file = join(dir, "STORY-1.md");
    await writeFile(file, "old", "utf8");
    await expect(
      writeAtomic(file, "new", {
        rename: () => Promise.reject(errno("EPERM")),
        pause: async () => {},
      }),
    ).rejects.toMatchObject({ code: "EPERM" });
    expect(await readFile(file, "utf8")).toBe("old");
    expect(await readdir(dir)).toEqual(["STORY-1.md"]);
  });

  it("does not try again for any other error", async () => {
    const dir = await folder();
    let calls = 0;
    await expect(
      writeAtomic(join(dir, "a.md"), "x", {
        rename: () => {
          calls++;
          return Promise.reject(errno("ENOSPC"));
        },
        pause: async () => {},
      }),
    ).rejects.toMatchObject({ code: "ENOSPC" });
    expect(calls).toBe(1);
  });
});
