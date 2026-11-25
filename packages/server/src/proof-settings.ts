/**
 * Project settings' Proof section (STORY-25): the project's proof (screenshots, Preview, both or neither), the dev
 * server's command and URL, the folder the project's tests write screenshots to, and whether the Dev Lead reviews the
 * screenshots before Acceptance (STORY-73). The values live in the project's `.featra/config.yaml`, as the Checks
 * section's do (check-settings.ts), and the dev-server command runs only once the
 * user has confirmed it here: one changed through git shows as not confirmed and doesn't run.
 */
import {
  CHECKS_COPY,
  designReviewOn,
  PROOF_COPY,
  type ProjectConfig,
  type ProofMode,
  type ProofPatch,
  type ProofView,
} from "@featra/work-format";
import { commandStore } from "./command-store.ts";
import { writeConfigValue } from "./config-writer.ts";
import type { Scan } from "./work-scan.ts";

export interface ProofSettingsDeps {
  scan: (dir: string) => Promise<Scan | null>;
  /** The app's data folder, where the confirmed command is kept; without it, it lasts until exit. */
  dataDir?: string;
}

const KEYS = ["proof", "devServerCommand", "devServerUrl", "testScreenshots", "designReview"] as const;

export function createProofSettings({ scan, dataDir }: ProofSettingsDeps) {
  const confirmed = commandStore(dataDir, "dev-server-confirmed.json");

  async function view(dir: string, error: string | null = null): Promise<ProofView> {
    const config = (await scan(dir).catch(() => null))?.collected.config;
    const known = (await confirmed.get(dir)).command;
    const command = config?.devServerCommand ?? null;
    return {
      proof: config?.proof ?? null,
      devServerCommand: command,
      devServerUrl: config?.devServerUrl ?? null,
      testScreenshots: config?.testScreenshots ?? null,
      designReview: config ? designReviewOn(config) : false,
      unconfirmed: command !== null && command !== known,
      error: config ? error : (error ?? CHECKS_COPY.notFeatra),
    };
  }

  return {
    load: (dir: string) => view(dir),

    /** Writes the changed settings; the first one the file refuses stops it and is reported. */
    async set(dir: string, patch: ProofPatch): Promise<ProofView> {
      for (const key of KEYS) {
        if (patch[key] === undefined) continue;
        const { error } = await writeConfigValue<keyof ProjectConfig>(dir, key, patch[key]);
        if (error !== null) return view(dir, error);
      }
      // A command the user saved, or confirmed as it is, is the one that runs.
      const config = (await scan(dir))?.collected.config;
      if (patch.devServerCommand !== undefined) await confirmed.set(dir, "command", patch.devServerCommand);
      else if (patch.confirm && config) await confirmed.set(dir, "command", config.devServerCommand);
      return view(dir);
    },

    /** Sets the project's proof: the user's answer to the proof question. */
    setProof: (dir: string, mode: ProofMode) => writeConfigValue(dir, "proof", mode),

    /** The dev-server command that may run for the project, or why none may. */
    async command(
      dir: string,
      config: ProjectConfig,
    ): Promise<{ ok: true; command: string } | { ok: false; note: string }> {
      const command = config.devServerCommand;
      if (command === null) return { ok: false, note: PROOF_COPY.notes.noCommand };
      if ((await confirmed.get(dir)).command !== command) return { ok: false, note: PROOF_COPY.notes.unconfirmed };
      return config.devServerUrl === null ? { ok: false, note: PROOF_COPY.notes.noUrl } : { ok: true, command };
    },
  };
}

export type ProofSettings = ReturnType<typeof createProofSettings>;
