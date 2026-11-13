import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ConfigError, errorMessage, isRecord, setConfigValue, type ProjectConfig } from "@featra/work-format";

export const CONFIG_PATH = [".featra", "config.yaml"] as const;
export const configFile = (projectDir: string) => join(projectDir, ...CONFIG_PATH);

/** A file that isn't there: Node's ENOENT. */
export const isMissing = (err: unknown) => isRecord(err) && err.code === "ENOENT";

/** Serialises writes to each config file, so quick changes land in order. */
const queues = new Map<string, Promise<unknown>>();

/**
 * Sets one key in the project's `.featra/config.yaml`, or removes it (`null`) so the default applies again. The file
 * is edited in place (comments and other keys kept) by work-format and replaced atomically. A file that can't be read
 * or would not be valid is left alone and the reason returned; `error` is null once written.
 */
export function writeConfigValue<K extends keyof ProjectConfig>(
  projectDir: string,
  key: K,
  value: ProjectConfig[K] | null,
): Promise<{ error: string | null }> {
  const file = configFile(projectDir);
  const run = async (): Promise<{ error: string | null }> => {
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } catch (err) {
      if (!isMissing(err)) return { error: errorMessage(err) };
    }
    let next: string;
    try {
      next = setConfigValue(text, key, value ?? undefined);
    } catch (err) {
      if (err instanceof ConfigError) return { error: err.message };
      throw err;
    }
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, next, "utf8");
    await rename(tmp, file);
    return { error: null };
  };
  const next = (queues.get(file) ?? Promise.resolve()).then(run, run);
  queues.set(
    file,
    next.catch(() => {}),
  );
  return next;
}
