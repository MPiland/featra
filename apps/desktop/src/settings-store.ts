import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { configOverrides, errorMessage, isRecord } from "@featra/work-format";
import {
  normalizeAppSettings,
  normalizeWorkOverrides,
  type AppSettings,
  type ProjectSettings,
  type WorkSettingKey,
  type WorkSettings,
} from "@featra/client/bridge";
import { configFile, CONFIG_PATH, isMissing, writeConfigValue } from "@featra/server/config-writer";
import { createJsonStore, type JsonStore } from "@featra/server/json-store";

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

export { CONFIG_PATH };

const message = errorMessage;

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

/**
 * Overrides one work setting in the project's `.featra/config.yaml`, or removes the override (`null`). The file is
 * edited in place by the server's config writer; a file that can't be read is left alone and its error returned.
 */
export async function writeProjectValue<K extends WorkSettingKey>(
  projectDir: string,
  key: K,
  value: WorkSettings[K] | null,
): Promise<ProjectSettings> {
  const { error } = await writeConfigValue(projectDir, key, value);
  const settings = await readProjectSettings(projectDir);
  return error === null ? settings : { ...settings, error };
}
