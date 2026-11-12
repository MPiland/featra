/**
 * Project settings' Checks section (STORY-56): where checks run, the check command and the linked-test command, with
 * what Featra and the Dev Lead propose. Confirmed values live in the project's `.featra/config.yaml`. Proposals never
 * do: they are kept in the app's data folder until the user confirms one, and nothing applies one by itself.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { isRecord } from "@featra/work-format/guards";
import {
  CHECKS_COPY,
  DEFAULT_CONFIG,
  defaultChecksWhere,
  proposeCommands,
  type CheckField,
  type CheckProposal,
  type ChecksPatch,
  type ChecksView,
  type GithubDetection,
  type ProjectConfig,
} from "@featra/work-format";
import { writeConfigValue } from "./config-writer.ts";
import { projectKey } from "./allowed-projects.ts";
import { detectGithub, type GithubDeps } from "./github-detect.ts";
import { createJsonStore, type JsonStore } from "./json-store.ts";
import type { Scan } from "./work-scan.ts";

/** What the Dev Lead proposed for each project, by project key. */
type Proposed = Record<string, Partial<Record<CheckField, string>>>;

const normalizeProposed = (raw: unknown): Proposed => {
  const out: Proposed = {};
  if (typeof raw !== "object" || raw === null) return out;
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

export interface CheckSettingsDeps extends GithubDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The app's data folder, where the Dev Lead's proposals are kept; without it they last until exit. */
  dataDir?: string;
}

const FILES_FOR_PROPOSALS = ["pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock", "package-lock.json"];
const DETECT_TTL_MS = 60_000;

/** What the project's files propose: the `test` script and a test runner it depends on. */
async function fromFiles(dir: string): Promise<CheckProposal[]> {
  const packageJson = await readFile(join(dir, "package.json"), "utf8").catch(() => null);
  const names = await readdir(dir).catch(() => [] as string[]);
  return proposeCommands({ packageJson, lockfiles: FILES_FOR_PROPOSALS.filter((f) => names.includes(f)) });
}

export function createCheckSettings(deps: CheckSettingsDeps) {
  const { scan, now, dataDir } = deps;
  const store: JsonStore<Proposed> | null = dataDir
    ? createJsonStore(dataDir, "check-proposals.json", normalizeProposed)
    : null;
  let memory: Proposed = {};
  const proposed = () => (store ? store.load() : Promise.resolve(memory));
  const save = async (next: Proposed) => {
    memory = next;
    if (store) await store.save(next);
  };
  const detected = new Map<string, { at: number; found: Promise<GithubDetection> }>();

  /** What Featra found about GitHub in `dir`, asked again after a minute. */
  function github(dir: string): Promise<GithubDetection> {
    const hit = detected.get(dir);
    if (hit && now().getTime() - hit.at < DETECT_TTL_MS) return hit.found;
    const found = detectGithub(dir, deps);
    detected.set(dir, { at: now().getTime(), found });
    return found;
  }

  async function view(dir: string, config: ProjectConfig, error: string | null): Promise<ChecksView> {
    const found = await github(dir);
    const fallback = defaultChecksWhere(found);
    const theirs = (await proposed())[projectKey(dir)] ?? {};
    const dev = (["command", "testCommand"] as const).flatMap((field): CheckProposal[] =>
      theirs[field] ? [{ field, value: theirs[field], source: "dev-lead" }] : [],
    );
    const current = { command: config.checkCommand, testCommand: config.linkedTestCommand };
    const proposals = [...dev, ...(await fromFiles(dir))].filter((p) => p.value !== current[p.field]);
    return {
      where: config.checksWhere ?? fallback.where,
      chosen: config.checksWhere !== null,
      reason: config.checksWhere === null ? fallback.reason : "",
      command: config.checkCommand,
      testCommand: config.linkedTestCommand,
      proposals,
      error,
    };
  }

  const load = async (dir: string, error: string | null = null): Promise<ChecksView> => {
    const config = (await scan(dir).catch(() => null))?.collected.config;
    if (!config) return { ...(await view(dir, DEFAULT_CONFIG, null)), error: error ?? CHECKS_COPY.notFeatra };
    return view(dir, config, error);
  };

  return {
    github,
    load: (dir: string) => load(dir),

    /** Writes the changed settings to the project's config; the first one the file refuses stops it and is reported. */
    async set(dir: string, patch: ChecksPatch): Promise<ChecksView> {
      const writes = [
        ["checksWhere", patch.where],
        ["checkCommand", patch.command],
        ["linkedTestCommand", patch.testCommand],
      ] as const;
      for (const [key, value] of writes) {
        if (value === undefined) continue;
        const { error } = await writeConfigValue(dir, key, value);
        if (error !== null) return load(dir, error);
      }
      // A confirmed command is no longer a proposal.
      const mine = { ...(await proposed()) };
      const key = projectKey(dir);
      const theirs = { ...mine[key] };
      if (patch.command !== undefined) delete theirs.command;
      if (patch.testCommand !== undefined) delete theirs.testCommand;
      await save({ ...mine, [key]: theirs });
      await scan(dir);
      return load(dir);
    },

    /** Puts the Dev Lead's proposal in the project's settings. It is only shown there, until the user confirms it. */
    async propose(dir: string, field: CheckField, value: string): Promise<void> {
      const mine = await proposed();
      const key = projectKey(dir);
      await save({ ...mine, [key]: { ...mine[key], [field]: value } });
      await scan(dir);
    },
  };
}

export type CheckSettings = ReturnType<typeof createCheckSettings>;
