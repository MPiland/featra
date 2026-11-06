import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { configOverrides, ConfigError, errorMessage, isRecord, setConfigValue } from "@featra/work-format";
import {
  normalizeAppSettings,
  normalizeWorkOverrides,
  type AppSettings,
  type ProjectSettings,
  type WorkSettingKey,
  type WorkSettings,
} from "@featra/client/bridge";
import { createJsonStore, type JsonStore } from "./ui-state-store.ts";

export type SettingsStore = JsonStore<AppSettings>;

/**
 * App settings: `settings.json` in the user's config folder (Electron's userData: %APPDATA%\Featra,
 * ~/Library/Application Support/Featra, ~/.config/Featra). Free of Electron imports.
 *
 * The theme used to live in `ui-state.json` (STORY-18). A profile with no settings file yet takes the theme from there,
 * once, so a pinned theme survives the move.
 */
export function createSettingsStore(dir: string): SettingsStore {
  const store = createJsonStore(dir, "settings.json", normalizeAppSettings);
  return {
    ...store,
    file: store.file,
    get pending() {
      return store.pending;
    },
    async load() {
      if (await exists(store.file)) return store.load();
      try {
        const legacy: unknown = JSON.parse(await readFile(join(dir, "ui-state.json"), "utf8"));
        return normalizeAppSettings({ theme: isRecord(legacy) ? legacy.theme : undefined });
      } catch {
        return normalizeAppSettings(undefined);
      }
    },
  };
}

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

export const CONFIG_PATH = [".featra", "config.yaml"] as const;
const configFile = (projectDir: string) => join(projectDir, ...CONFIG_PATH);

const message = errorMessage;

/** A file that isn't there: Node's ENOENT. */
const isMissing = (err: unknown) => isRecord(err) && err.code === "ENOENT";

/** Reads the project's work-setting overrides from `.featra/config.yaml`. No file means no overrides. */
export async function readProjectSettings(projectDir: string): Promise<ProjectSettings> {
  let text: string;
  try {
    text = await readFile(configFile(projectDir), "utf8");
  } catch (err) {
    if (isMissing(err)) return { dir: projectDir, overrides: {}, error: null };
    return { dir: projectDir, overrides: {}, error: message(err) };
  }
  try {
    return { dir: projectDir, overrides: normalizeWorkOverrides(configOverrides(text)), error: null };
  } catch (err) {
    return { dir: projectDir, overrides: {}, error: message(err) };
  }
}

/** Serialises writes to each config file, so quick changes land in order. */
const queues = new Map<string, Promise<unknown>>();

/**
 * Overrides one work setting in the project's `.featra/config.yaml`, or removes the override (`null`). The file is
 * edited in place (comments and other keys kept) by work-format, and replaced atomically. A file that can't be read
 * is left alone and its error returned.
 */
export function writeProjectValue<K extends WorkSettingKey>(
  projectDir: string,
  key: K,
  value: WorkSettings[K] | null,
): Promise<ProjectSettings> {
  const file = configFile(projectDir);
  const run = async (): Promise<ProjectSettings> => {
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } catch (err) {
      if (!isMissing(err)) return { dir: projectDir, overrides: {}, error: message(err) };
    }
    let next: string;
    try {
      next = setConfigValue(text, key, value ?? undefined);
    } catch (err) {
      if (err instanceof ConfigError) return { ...(await readProjectSettings(projectDir)), error: err.message };
      throw err;
    }
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, next, "utf8");
    await rename(tmp, file);
    return readProjectSettings(projectDir);
  };
  const next = (queues.get(file) ?? Promise.resolve()).then(run, run);
  queues.set(
    file,
    next.catch(() => {}),
  );
  return next;
}
