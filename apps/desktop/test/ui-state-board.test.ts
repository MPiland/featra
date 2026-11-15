/** STORY-17: the board choice is stored with the rest of the UI state in userData, and survives a restart. */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_UI_STATE } from "@featra/client/bridge";
import { createUiStateStore } from "../src/ui-state-store.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "featra-ui-board-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("AC1: the layout is remembered per project across restarts", () => {
  it("a restarted app reads back the projects that show the board", async () => {
    const state = { ...DEFAULT_UI_STATE, boardProjects: ["/home/me/manager"] };
    await createUiStateStore(dir).save(state);
    const read = await createUiStateStore(dir).load();
    expect(read).toEqual(state);
  });

  it("drops malformed entries from a hand-edited file", async () => {
    const store = createUiStateStore(dir);
    await writeFile(store.file, JSON.stringify({ boardProjects: ["/a", 3, "", "/a", null] }), "utf8");
    expect((await store.load()).boardProjects).toEqual(["/a"]);
    await writeFile(store.file, JSON.stringify({ boardProjects: "/a" }), "utf8");
    expect(await store.load()).toEqual(DEFAULT_UI_STATE);
  });
});
