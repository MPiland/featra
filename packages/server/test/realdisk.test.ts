/** STORY-47: the real disk the log writer replaces files on: where a write goes, and what it does when it can't. */
import { appendFile, readdir, readFile, rename as realRename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DecisionInput } from "@featra/work-format";
import { createLogWriter, createNodeLogFs, nodeLogFs } from "../src/log-writer.ts";
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
const decision = (text: string): DecisionInput => ({
  kind: "decision",
  decision: text,
  why: "Why.",
  rejected: [],
  card: null,
});

describe("writing a file on the real disk", () => {
  it("replaces the file, and leaves no temporary file behind", async () => {
    const dir = await folder();
    const file = join(dir, "decisions.md");
    await writeFile(file, "old");
    expect(await nodeLogFs.write(file, "new", "old")).toBeUndefined();
    expect(await readFile(file, "utf8")).toBe("new");
    expect(await readdir(dir)).toEqual(["decisions.md"]);
  });

  it("makes a missing file, and its folder", async () => {
    const dir = await folder();
    const file = join(dir, "deeper", "decisions.md");
    expect(await nodeLogFs.write(file, "first", null)).toBeUndefined();
    expect(await nodeLogFs.read(file)).toBe("first");
    expect(await nodeLogFs.read(join(dir, "missing.md"))).toBeNull();
  });

  it("writes nothing when the file isn't what the caller read", async () => {
    const dir = await folder();
    const file = join(dir, "decisions.md");
    await writeFile(file, "changed by the user");
    expect(await nodeLogFs.write(file, "new", "old")).toBe("changed");
    expect(await nodeLogFs.write(file, "new", null)).toBe("changed");
    expect(await readFile(file, "utf8")).toBe("changed by the user");
    expect(await readdir(dir)).toEqual(["decisions.md"]);
  });

  it("uses a temporary name of its own for each write", async () => {
    const dir = await folder();
    const seen: string[] = [];
    const fs = createNodeLogFs({
      rename: async (from, to) => {
        seen.push(String(from));
        await realRename(from, to);
      },
    });
    const file = join(dir, "decisions.md");
    await fs.write(file, "a", null);
    await fs.write(file, "b", "a");
    expect(new Set(seen).size).toBe(2);
    for (const name of seen) expect(name).toMatch(/decisions\.md\.[0-9a-f]+\.tmp$/);
  });

  it("tries again when Windows says the file is busy, and then succeeds", async () => {
    const dir = await folder();
    const file = join(dir, "decisions.md");
    let calls = 0;
    const pauses: number[] = [];
    const fs = createNodeLogFs({
      rename: async (from, to) => {
        if (++calls <= 2) throw errno(calls === 1 ? "EPERM" : "EBUSY");
        await realRename(from, to);
      },
      pause: async (ms) => void pauses.push(ms),
    });
    await fs.write(file, "done", null);
    expect(await readFile(file, "utf8")).toBe("done");
    expect(calls).toBe(3);
    expect(pauses).toHaveLength(2);
  });

  it("gives a clear error when the file stays busy, and leaves no temporary file", async () => {
    const dir = await folder();
    const file = join(dir, "decisions.md");
    await writeFile(file, "old");
    const fs = createNodeLogFs({
      rename: async () => {
        throw errno("EBUSY");
      },
      pause: async () => {},
    });
    await expect(fs.write(file, "new", "old")).rejects.toThrow(
      "Couldn't write decisions.md: another program has it open.",
    );
    expect(await readFile(file, "utf8")).toBe("old");
    expect(await readdir(dir)).toEqual(["decisions.md"]);
  });

  it("does not hide any other failure", async () => {
    const dir = await folder();
    const fs = createNodeLogFs({
      rename: async () => {
        throw errno("ENOSPC");
      },
    });
    await expect(fs.write(join(dir, "decisions.md"), "x", null)).rejects.toThrow("ENOSPC");
  });
});

describe("the writer on the real disk", () => {
  it("keeps a line the user saves between the writer's read and its write", async () => {
    const dir = await folder();
    const file = join(dir, "decisions.md");
    await writeFile(file, "# Decisions\n");
    let saved = false;
    const writer = createLogWriter({
      fs: {
        ...nodeLogFs,
        read: async (f) => {
          const text = await nodeLogFs.read(f);
          if (!saved) {
            saved = true;
            await appendFile(f, "My own line\n");
          }
          return text;
        },
      },
    });
    await writer.append(dir, "c1", decision("One"), "Developer chat 1");
    const text = await readFile(file, "utf8");
    expect(text).toContain("My own line");
    expect(text).toContain("One");
  });

  it("lands every entry when several chats log at once", async () => {
    const dir = await folder();
    const writer = createLogWriter();
    await Promise.all(["A", "B", "C", "D"].map((n) => writer.append(dir, `c${n}`, decision(`Entry ${n}`), "Chat")));
    const text = await readFile(join(dir, "decisions.md"), "utf8");
    for (const n of ["A", "B", "C", "D"]) expect(text).toContain(`Entry ${n}`);
    expect(await readdir(dir)).toEqual(["decisions.md"]);
  });
});
