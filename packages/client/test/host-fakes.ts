// The host's setup of a project folder and its app commands, as fakes for the harness: in memory, each call recorded.
import { SETUP_ITEM_IDS } from "@featra/work-format/setup-plan";
import type { FeatraBridge, ProjectSetup } from "../src/bridge.ts";
import type { HostOptions } from "./harness-options.ts";

/** The project folders on disk, as the server sees them: git init and Featra init move a folder to the next state. */
export function fakeSetupServer(host: HostOptions, calls: string[]): FeatraBridge["setup"] {
  const setupOnDisk = new Map(Object.entries(host.setup ?? {}));
  const setupOf = (dir: string): ProjectSetup => setupOnDisk.get(dir) ?? { state: "ready" };
  return {
    status: async (dir) => setupOf(dir),
    plan: async (dir) => {
      const failure = host.planFailures?.[dir];
      if (failure) return { ok: false, error: failure };
      const existing = new Set(host.existing?.[dir] ?? []);
      return {
        ok: true,
        git: setupOf(dir).state !== "no-git",
        items: SETUP_ITEM_IDS.map((id) => ({ id, exists: existing.has(id) })),
      };
    },
    run: async (dir, items) => {
      calls.push(`setup:${dir}:${items.join(",")}`);
      const failure = host.initFailures?.[dir];
      if (failure) return { ok: false, error: failure };
      setupOnDisk.set(dir, { state: "ready" });
      return { ok: true, ...(host.initResults?.[dir] ?? { created: [".featra/config.yaml"], kept: [] }) };
    },
  };
}

/** The app's own commands (menu and Help): each one recorded. */
export const fakeAppHost = (calls: string[]): FeatraBridge["app"] => ({
  info: async () => ({ name: "Featra", version: "1.2.3" }),
  reload: () => void calls.push("reload"),
  toggleDevTools: () => void calls.push("toggleDevTools"),
  showLogs: () => void calls.push("showLogs"),
  openExternal: (url) => void calls.push(`openExternal:${url}`),
  openEvidence: (file) => void calls.push(`openFile:${file}`),
  copyText: (text) => void calls.push(`copyText:${text}`),
  clearCacheAndRestart: () => void calls.push("clearCacheAndRestart"),
  resetAppData: () => void calls.push("resetAppData"),
  quit: () => void calls.push("quit"),
});
