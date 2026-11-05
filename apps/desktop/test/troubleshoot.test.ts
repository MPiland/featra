import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_UI_STATE } from "@featra/client/bridge";
import { createLog } from "../src/log.ts";
import { clearCacheAndRestart, resetAppData, type TroubleshootDeps } from "../src/troubleshoot.ts";
import { createAppStateStore, createUiStateStore } from "../src/ui-state-store.ts";

/** Real stores and log in a temporary userData folder; only Electron's session and the relaunch are faked. */
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "featra-troubleshoot-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function setup() {
  const steps: string[] = [];
  const ui = createUiStateStore(dir);
  const appState = createAppStateStore(dir);
  const log = createLog(join(dir, "logs"));
  const deps: TroubleshootDeps = {
    session: {
      clearCache: async () => void steps.push("clearCache"),
      clearStorageData: async () => void steps.push("clearStorageData"),
    },
    stores: [ui, appState],
    log,
    restart: () => void steps.push("restart"),
  };
  return { steps, ui, appState, log, deps };
}

describe("AC5: Help > Troubleshooting", () => {
  it("Clear Cache and Restart clears the cache, keeps stored settings, then restarts", async () => {
    const { steps, ui, log, deps } = setup();
    await ui.save({ ...DEFAULT_UI_STATE, zoomFactor: 1.5 });
    await clearCacheAndRestart(deps);
    expect(steps).toEqual(["clearCache", "restart"]);
    expect((await createUiStateStore(dir).load()).zoomFactor).toBe(1.5);
    expect(await readFile(log.file, "utf8")).toMatch(/Cache cleared; restarting\n$/);
  });

  it("Reset App Data clears web storage, cache and Featra's state files, keeps the log, then restarts", async () => {
    const { steps, ui, appState, log, deps } = setup();
    await ui.save({ ...DEFAULT_UI_STATE, sidebarCollapsed: true, zoomFactor: 1.5 });
    await appState.save({ trayNoticeShown: true });
    log.info("before the reset");
    await resetAppData(deps);
    expect(steps).toEqual(["clearStorageData", "clearCache", "restart"]);
    expect(await createUiStateStore(dir).load()).toEqual(DEFAULT_UI_STATE);
    expect(await createAppStateStore(dir).load()).toEqual({ trayNoticeShown: false });
    expect(await readFile(log.file, "utf8")).toMatch(/before the reset\n.*App data reset; restarting\n$/);
  });
});
