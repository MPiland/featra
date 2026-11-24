/**
 * STORY-72 review: an evidence path is walked part by part on real files, and no part of it may be a link. A linked or
 * junctioned `.featra`, `evidence`, feature or story folder would otherwise let a read (or `update_card`'s link) reach
 * any file in the checkout it points at.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evidenceOnDisk } from "../src/evidence-disk.ts";

const FOLDER = [".featra", "evidence", "FEAT-1", "STORY-1"] as const;
const PATH = `${FOLDER.join("/")}/secret.txt`;

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "featra-evidence-disk-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

/**
 * Makes the evidence folder's part at `depth` a link of `type` to a folder in the checkout (`src`) that holds the rest
 * of the path and the file, as an agent could. Junctions need no rights on Windows; elsewhere `type` is ignored.
 */
async function linkPart(depth: number, type: "dir" | "junction") {
  const target = join(root, "src");
  const rest = FOLDER.slice(depth + 1);
  await mkdir(join(target, ...rest), { recursive: true });
  await writeFile(join(target, ...rest, "secret.txt"), "secret");
  await mkdir(join(root, ...FOLDER.slice(0, depth)), { recursive: true });
  await symlink(target, join(root, ...FOLDER.slice(0, depth + 1)), type);
}

describe("an evidence file on disk", () => {
  it("is read from a real evidence folder", async () => {
    await mkdir(join(root, ...FOLDER), { recursive: true });
    await writeFile(join(root, ...FOLDER, "secret.txt"), "ok");
    expect(await evidenceOnDisk(root, PATH)).toMatchObject({ ok: true });
  });

  it.each([
    ["the .featra folder", 0],
    ["the evidence folder", 1],
    ["the feature's folder", 2],
    ["the story's folder", 3],
  ])("is refused when %s is a junction into the checkout", async (_what, depth) => {
    await linkPart(depth, "junction");
    expect(await evidenceOnDisk(root, PATH)).toEqual({ ok: false, problem: "outside" });
  });

  it("is refused when the story's folder is a symbolic link into the checkout", async ({ skip }) => {
    try {
      await linkPart(3, "dir");
    } catch {
      skip("this machine can't make symbolic links");
    }
    expect(await evidenceOnDisk(root, PATH)).toEqual({ ok: false, problem: "outside" });
  });
});
