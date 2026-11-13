/**
 * Project settings' Checks section (STORY-56): where checks run, the check command and the linked-test command, with
 * what Featra and the Dev Lead propose. The values live in the project's `.featra/config.yaml`, which git can change,
 * so the app's data folder also keeps the commands the user last confirmed: a different one in the file shows as
 * changed and does not run until the user confirms it. Proposals are kept there too and never apply by themselves.
 * The section also says whether GitHub is usable and holds the story PR settings (STORY-11) and the test report CI
 * uploads (STORY-57).
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
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
  type GithubUse,
  type ProjectConfig,
} from "@featra/work-format";
import { writeConfigValue } from "./config-writer.ts";
import { detectGithub, detectGithubUse, type GithubDeps } from "./github-detect.ts";
import { commandStore } from "./command-store.ts";
import type { Scan } from "./work-scan.ts";

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
  const proposed = commandStore(dataDir, "check-proposals.json");
  const confirmed = commandStore(dataDir, "check-confirmed.json");
  const confirm = (dir: string, field: CheckField, value: string | null) => confirmed.set(dir, field, value);
  /** A detection per project, asked again after a minute. */
  const cached = <T>(detect: (dir: string) => Promise<T>) => {
    const detected = new Map<string, { at: number; found: Promise<T> }>();
    return (dir: string): Promise<T> => {
      const hit = detected.get(dir);
      if (hit && now().getTime() - hit.at < DETECT_TTL_MS) return hit.found;
      const found = detect(dir);
      detected.set(dir, { at: now().getTime(), found });
      return found;
    };
  };
  /** What Featra found about GitHub in `dir`: remote, workflows, visibility. */
  const github = cached<GithubDetection>((dir) => detectGithub(dir, deps));
  /** Whether GitHub is usable in `dir` for story PRs (STORY-11), and what is missing when it is not. */
  const githubUse = cached<GithubUse>((dir) => detectGithubUse(dir, deps));

  /** The commands of the config that the user has confirmed (the only ones that run), and which are not confirmed. */
  async function changed(dir: string, config: ProjectConfig) {
    const known = await confirmed.get(dir);
    const current = { command: config.checkCommand, testCommand: config.linkedTestCommand };
    const fields = ["command", "testCommand"] as const;
    const ok = (f: CheckField) => (current[f] !== null && current[f] === known[f] ? current[f] : null);
    return {
      command: ok("command"),
      testCommand: ok("testCommand"),
      unconfirmed: fields.filter((f) => current[f] !== null && current[f] !== known[f]),
    };
  }

  async function view(dir: string, config: ProjectConfig, error: string | null): Promise<ChecksView> {
    const [found, use] = await Promise.all([github(dir), githubUse(dir)]);
    const fallback = defaultChecksWhere(found);
    const theirs = await proposed.get(dir);
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
      unconfirmed: (await changed(dir, config)).unconfirmed,
      github: use,
      openStoryPrs: config.openStoryPrs,
      openFeaturePrs: config.openFeaturePrs,
      prRefreshMinutes: config.prRefreshMinutes,
      testReportArtifact: config.testReportArtifact,
      testReportFiles: config.testReportFiles,
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
    githubUse,
    /** The commands the user has confirmed, which are the only ones that run, and which are not confirmed yet. */
    confirmed: changed,
    load: (dir: string) => load(dir),

    /** Writes the changed settings to the project's config; the first one the file refuses stops it and is reported. */
    async set(dir: string, patch: ChecksPatch): Promise<ChecksView> {
      const writes = [
        ["checksWhere", patch.where],
        ["checkCommand", patch.command],
        ["linkedTestCommand", patch.testCommand],
        ["openStoryPrs", patch.openStoryPrs],
        ["openFeaturePrs", patch.openFeaturePrs],
        ["prRefreshMinutes", patch.prRefreshMinutes],
        ["testReportArtifact", patch.testReportArtifact],
        ["testReportFiles", patch.testReportFiles],
      ] as const;
      for (const [key, value] of writes) {
        if (value === undefined) continue;
        const { error } = await writeConfigValue<keyof ProjectConfig>(dir, key, value);
        if (error !== null) return load(dir, error);
      }
      // What the user saved or confirmed is what they now trust, and a saved command is no longer a proposal.
      const config = (await scan(dir))?.collected.config;
      const current = { command: config?.checkCommand ?? null, testCommand: config?.linkedTestCommand ?? null };
      for (const field of ["command", "testCommand"] as const) {
        if (patch[field] !== undefined) {
          await proposed.set(dir, field, null);
          await confirm(dir, field, patch[field]);
        } else if (patch.confirm?.includes(field) && config) await confirm(dir, field, current[field]);
      }
      return load(dir);
    },

    /** Puts the Dev Lead's proposal in the project's settings. It is only shown there, until the user confirms it. */
    async propose(dir: string, field: CheckField, value: string): Promise<void> {
      await proposed.set(dir, field, value);
      await scan(dir);
    },
  };
}

export type CheckSettings = ReturnType<typeof createCheckSettings>;
