/**
 * STORY-59 AC4: the effective auto-merge setting, as the server reads it: the project's `.featra/config.yaml`, else the
 * app default in the app's `settings.json`, else on. Real files in a temporary folder.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAutoMerge } from "../src/mcp-enabled.ts";

let root: string;
let project: string;
let data: string;
const config = (text: string) => writeFile(join(project, ".featra", "config.yaml"), text);
const appDefault = (work: Record<string, unknown>) => writeFile(join(data, "settings.json"), JSON.stringify({ work }));

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "featra-auto-merge-"));
  project = join(root, "project");
  data = join(root, "data");
  await mkdir(join(project, ".featra"), { recursive: true });
  await mkdir(data);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("STORY-59 AC4: auto-merge is on by default, with an app default and a project override", () => {
  it("is on when neither the project nor the app sets it", async () => {
    await config("version: 1\n");
    expect(await readAutoMerge(data)(project)).toBe(true);
    expect(await readAutoMerge(undefined)(project)).toBe(true);
  });

  it("follows the app default when the project doesn't set it", async () => {
    await config("version: 1\n");
    await appDefault({ autoMerge: false });
    expect(await readAutoMerge(data)(project)).toBe(false);
  });

  it("is the project's own value over the app default", async () => {
    await config("version: 1\nautoMerge: true\n");
    await appDefault({ autoMerge: false });
    expect(await readAutoMerge(data)(project)).toBe(true);
    await config("version: 1\nautoMerge: false\n");
    await appDefault({ autoMerge: true });
    expect(await readAutoMerge(data)(project)).toBe(false);
  });

  it("is read each time, so a change in Settings applies to the next check", async () => {
    await config("version: 1\n");
    const read = readAutoMerge(data);
    expect(await read(project)).toBe(true);
    await appDefault({ autoMerge: false });
    expect(await read(project)).toBe(false);
  });
});
