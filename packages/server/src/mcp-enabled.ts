import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CONFIG_FILE,
  isKnowledgePermission,
  isRecord,
  knowledgePermission,
  maxStoryAgents,
  mcpEnabled,
  type KnowledgePermission,
} from "@featra/work-format";

/** A file's text, or null when it isn't there or can't be read: the setting then isn't set there. */
async function textOf(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** The app-wide default for a work setting (Settings > Workflow, in the app's `settings.json`), when the file sets one. */
function appDefault(settings: string | null, key: string): unknown {
  try {
    const raw: unknown = settings === null ? null : JSON.parse(settings);
    const work = isRecord(raw) ? raw.work : null;
    return isRecord(work) ? work[key] : undefined;
  } catch {
    return undefined;
  }
}

/** The project's config and the app's settings, as text: both read only, each time they are asked for. */
async function settingsText(dataDir: string | undefined, dir: string) {
  return {
    config: await textOf(join(dir, ...CONFIG_FILE.split("/"))),
    settings: dataDir ? await textOf(join(dataDir, "settings.json")) : null,
  };
}

/**
 * Whether a project's agents get the Featra MCP (ADR 0006): the project's `.featra/config.yaml`, else the app default
 * from `dataDir`'s `settings.json` (read only, never written), else on. Read whenever an agent starts and whenever one
 * logs, so turning it off in Settings reaches chats that are already running.
 */
export function readMcpEnabled(dataDir: string | undefined): (dir: string) => Promise<boolean> {
  return async (dir) => {
    const { config, settings } = await settingsText(dataDir, dir);
    const fallback = appDefault(settings, "mcp");
    return mcpEnabled(config, typeof fallback === "boolean" ? fallback : undefined);
  };
}

/** What the project lets agents do to its knowledge files (`knowledge`), read the same way. */
export function readKnowledge(dataDir: string | undefined): (dir: string) => Promise<KnowledgePermission> {
  return async (dir) => {
    const { config, settings } = await settingsText(dataDir, dir);
    const fallback = appDefault(settings, "knowledge");
    return knowledgePermission(config, isKnowledgePermission(fallback) ? fallback : undefined);
  };
}

/** The most story sessions a project runs at once (STORY-9): its `maxStoryAgents`, else the app default, else 3. */
export function readMaxStoryAgents(dataDir: string | undefined): (dir: string) => Promise<number> {
  return async (dir) => {
    const { config, settings } = await settingsText(dataDir, dir);
    const fallback = appDefault(settings, "maxStoryAgents");
    return maxStoryAgents(
      config,
      typeof fallback === "number" && Number.isInteger(fallback) && fallback >= 1 ? fallback : undefined,
    );
  };
}
