/**
 * STORY-61 review: saving the app's settings rescans a project and re-checks auto-merge only when that project's
 * auto-merge setting in effect changed. The real settings reads, over a real settings file and project configs on
 * disk; only the scan and the re-check are recorded.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAppAutoMerge } from "../src/mcp-enabled.ts";
import { createSettingsChanges } from "../src/settings-changes.ts";

let root: string;
let data: string;
let follows: string;
let own: string;
const scanned: string[] = [];
let rechecks = 0;

const appDefault = (autoMerge: boolean | null) =>
  writeFile(join(data, "settings.json"), JSON.stringify(autoMerge === null ? {} : { work: { autoMerge } }));

async function projectAt(name: string, config: string) {
  const dir = join(root, name);
  await mkdir(join(dir, ".featra"), { recursive: true });
  await writeFile(join(dir, ".featra", "config.yaml"), config);
  return dir;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "featra-settings-"));
  data = join(root, "data");
  await mkdir(data);
  follows = await projectAt("follows", "version: 1\n");
  own = await projectAt("own", "version: 1\nautoMerge: true\n");
  scanned.length = 0;
  rechecks = 0;
});
afterEach(() => rm(root, { recursive: true, force: true }));

/** Settings changes as the server makes them, over the app default the file has now. */
const changes = () =>
  createSettingsChanges({
    appAutoMerge: readAppAutoMerge(data),
    dirs: () => [follows, own],
    scan: async (dir) => void scanned.push(dir),
    recheck: () => void (rechecks += 1),
    log: (line) => expect.fail(line),
  });

describe("STORY-61 review: a settings save rescans only on a change to the auto-merge setting in effect", () => {
  it("does nothing when the save leaves the app default as it was", async () => {
    await appDefault(true);
    const c = changes();
    c.saved();
    await c.idle();
    expect(scanned).toEqual([]);
    expect(rechecks).toBe(0);
  });

  it("rescans only the projects that follow the app default once it changes, and re-checks auto-merge once", async () => {
    await appDefault(null);
    const c = changes();
    // Unset is on: turning it on changes nothing in effect.
    await appDefault(true);
    c.saved();
    await c.idle();
    expect(scanned).toEqual([]);

    await appDefault(false);
    c.saved();
    await c.idle();
    expect(scanned).toEqual([follows]);
    expect(rechecks).toBe(1);

    await appDefault(true);
    c.saved();
    await c.idle();
    expect(scanned).toEqual([follows, follows]);
    expect(rechecks).toBe(2);
  });
});
