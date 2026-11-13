/**
 * Check commands kept per project in the app's data folder (STORY-56): what the Dev Lead proposed, and what the user
 * last confirmed. Without a data folder they last until exit.
 */
import { isRecord } from "@featra/work-format/guards";
import type { CheckField } from "@featra/work-format";
import { projectKey } from "./allowed-projects.ts";
import { createJsonStore } from "./json-store.ts";

export type ProjectCommands = Partial<Record<CheckField, string>>;
type Commands = Record<string, ProjectCommands>;

const normalize = (raw: unknown): Commands => {
  const out: Commands = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const { command, testCommand } = value;
    out[key] = {
      ...(typeof command === "string" && command ? { command } : {}),
      ...(typeof testCommand === "string" && testCommand ? { testCommand } : {}),
    };
  }
  return out;
};

export function commandStore(dataDir: string | undefined, file: string) {
  const store = dataDir ? createJsonStore(dataDir, file, normalize) : null;
  let memory: Commands = {};
  const all = () => (store ? store.load() : Promise.resolve(memory));
  return {
    /** The project's commands. */
    get: async (dir: string): Promise<ProjectCommands> => (await all())[projectKey(dir)] ?? {},
    /** Sets a command, or removes it (null). */
    async set(dir: string, field: CheckField, value: string | null) {
      const mine = await all();
      const key = projectKey(dir);
      const { [field]: _gone, ...rest } = mine[key] ?? {};
      memory = { ...mine, [key]: value === null ? rest : { ...rest, [field]: value } };
      if (store) await store.save(memory);
    },
  };
}
