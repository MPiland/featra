import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_UI_STATE, type UiState } from "@featra/client/bridge";
import { createAppStateStore, createUiStateStore } from "../src/ui-state-store.ts";

const sidebar = (sidebarCollapsed: boolean): UiState => ({ ...DEFAULT_UI_STATE, sidebarCollapsed });

/** Runs the real store against a temporary userData folder. */
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "featra-ui-state-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("AC2: sidebar state survives a restart", () => {
  it("a new store (a restarted app) reads back what the last one saved", async () => {
    await createUiStateStore(dir).save(sidebar(true));
    expect(await createUiStateStore(dir).load()).toEqual(sidebar(true));
    await createUiStateStore(dir).save(sidebar(false));
    expect(await createUiStateStore(dir).load()).toEqual(sidebar(false));
  });

  it("the sidebar is open on first launch", async () => {
    expect(await createUiStateStore(dir).load()).toEqual(sidebar(false));
  });

  it("a corrupt file falls back to defaults instead of breaking startup", async () => {
    const store = createUiStateStore(dir);
    await writeFile(store.file, "{ half written", "utf8");
    expect(await store.load()).toEqual(sidebar(false));
  });

  it("rapid toggles land in order: the last one wins", async () => {
    const store = createUiStateStore(dir);
    void store.save(sidebar(true));
    void store.save(sidebar(false));
    void store.save(sidebar(true));
    expect(store.pending).toBe(true);
    await store.flush();
    expect(store.pending).toBe(false);
    expect(JSON.parse(await readFile(store.file, "utf8"))).toEqual(sidebar(true));
  });

  it("creates the folder if it does not exist yet", async () => {
    const nested = join(dir, "fresh", "profile");
    await createUiStateStore(nested).save(sidebar(true));
    expect(await createUiStateStore(nested).load()).toEqual(sidebar(true));
  });

  it("a failed write rejects but does not block later saves", async () => {
    const blocker = join(dir, "not-a-dir");
    await writeFile(blocker, "", "utf8");
    const bad = createUiStateStore(join(blocker, "child"));
    await expect(bad.save(sidebar(true))).rejects.toThrow(/ENOTDIR|EEXIST|ENOENT/);
    expect(bad.pending).toBe(false);
    await expect(bad.flush()).resolves.toBeUndefined();
  });
});

// The theme moved to app settings in STORY-20: its restart test is in settings-store.test.ts (AC8).
describe("AC5: zoom survives a restart", () => {
  it("a restarted app reads back the zoom factor the last one saved", async () => {
    await createUiStateStore(dir).save({ sidebarCollapsed: false, zoomFactor: 1.25 });
    expect(await createUiStateStore(dir).load()).toEqual({ sidebarCollapsed: false, zoomFactor: 1.25 });
  });

  it("a file from before zoom existed loads with 100% zoom", async () => {
    const store = createUiStateStore(dir);
    await writeFile(store.file, JSON.stringify({ sidebarCollapsed: true }), "utf8");
    expect(await store.load()).toEqual({ sidebarCollapsed: true, zoomFactor: 1 });
  });
});

describe("AC6: the tray notice is remembered across restarts", () => {
  it("a fresh profile has not shown it; once saved, a restarted app knows it was shown", async () => {
    expect(await createAppStateStore(dir).load()).toEqual({ trayNoticeShown: false });
    await createAppStateStore(dir).save({ trayNoticeShown: true });
    expect(await createAppStateStore(dir).load()).toEqual({ trayNoticeShown: true });
  });

  it("a damaged file loads as not shown", async () => {
    const store = createAppStateStore(dir);
    await writeFile(store.file, '{"trayNoticeShown": "yes"', "utf8");
    expect(await store.load()).toEqual({ trayNoticeShown: false });
  });
});

describe("AC5: Reset App Data deletes the stored state", () => {
  it("remove() deletes the file after queued saves, so a restart starts from defaults", async () => {
    const store = createUiStateStore(dir);
    void store.save(sidebar(true));
    await store.remove();
    expect(await createUiStateStore(dir).load()).toEqual(DEFAULT_UI_STATE);
    await expect(readFile(store.file, "utf8")).rejects.toThrow(/ENOENT/);
    await store.remove(); // nothing left to delete is fine
  });
});
