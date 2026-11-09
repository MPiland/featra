import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_FILE, isRecord, mcpEnabled } from "@featra/work-format";

/** A file's text, or null when it isn't there or can't be read: the setting then isn't set there. */
async function textOf(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** The app-wide default (Settings > Workflow, in the app's `settings.json`), when the file sets one. */
function appDefault(settings: string | null): boolean | undefined {
  try {
    const raw: unknown = settings === null ? null : JSON.parse(settings);
    const work = isRecord(raw) ? raw.work : null;
    return isRecord(work) && typeof work.mcp === "boolean" ? work.mcp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a project's agents get the Featra MCP (ADR 0006): the project's `.featra/config.yaml`, else the app default
 * from `dataDir`'s `settings.json` (read only, never written), else on. Read each time an agent starts, so a change in
 * Settings applies to the next chat.
 */
export function readMcpEnabled(dataDir: string | undefined): (dir: string) => Promise<boolean> {
  return async (dir) => {
    const config = await textOf(join(dir, ...CONFIG_FILE.split("/")));
    const settings = dataDir ? await textOf(join(dataDir, "settings.json")) : null;
    return mcpEnabled(config, appDefault(settings));
  };
}
