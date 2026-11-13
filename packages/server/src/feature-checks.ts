/**
 * An accepted feature's checks on this computer (STORY-14, ADR 0037): the project's confirmed check command, run at
 * the commit the feature branch is at, in a temporary detached worktree that is removed afterwards. The user's
 * checkouts are never touched, and a branch nobody has checked out can be checked. The result is kept here, for that
 * commit only, and never written to the card: a card commit on the branch would move it past the commit it is for.
 * One run per feature at a time; a run for a commit the branch has moved past, or for a check command since changed,
 * still finishes, and counts for nothing. Worktrees a run left behind (the app quit mid-run) are pruned first.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECKS_COPY, toIso, type CardChecks, type FeatureChecks, type ProjectConfig } from "@featra/work-format";
import { runCommand, type RunControl } from "./check-run.ts";
import type { CheckSettings } from "./check-settings.ts";
import type { MergeGit } from "./merge-git.ts";

export interface FeatureChecksDeps {
  git: MergeGit;
  settings: Pick<CheckSettings, "confirmed">;
  now: () => Date;
  log: (message: string) => void;
  timeoutMs?: number;
  /** A run started or ended: the card shows it. */
  changed: (dir: string) => void;
}

/** What a feature's checks are: the commit and the project's check command they ran with, and what the card shows. */
interface Kept {
  tip: string;
  command: string | null;
  checks: CardChecks;
  noCommand: boolean;
}

const keyOf = (dir: string, id: string) => `${dir}\0${id}`;
const idle = (note: string): CardChecks => ({ running: false, idle: note, last: null, failedAcs: [], note: null });

export function createFeatureChecks({ git, settings, now, log, timeoutMs, changed }: FeatureChecksDeps) {
  const kept = new Map<string, Kept>();
  const runs = new Map<string, Promise<void>>();
  const active = new Set<RunControl>();
  let closed = false;

  /** Runs `command` at `tip` in a temporary detached worktree; its exit and output. */
  async function runAt(top: string, tip: string, command: string) {
    await git.git(top, ["worktree", "prune"]);
    const folder = await mkdtemp(join(tmpdir(), "featra-feature-checks-"));
    try {
      const added = await git.git(top, ["worktree", "add", "--detach", "--quiet", folder, tip]);
      if (added.code !== 0) return { code: null, output: added.stderr, timedOut: false };
      const control = runCommand(command, folder, timeoutMs);
      active.add(control);
      try {
        return await control.done;
      } finally {
        active.delete(control);
      }
    } finally {
      await git.removeFolder(top, folder);
      await rm(folder, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function execute(dir: string, id: string, top: string, tip: string, config: ProjectConfig) {
    const key = keyOf(dir, id);
    const command = (await settings.confirmed(dir, config)).command;
    const ran = config.checkCommand;
    if (ran === null || command === null) {
      kept.set(key, { tip, command: ran, checks: idle(CHECKS_COPY.noCommand), noCommand: true });
      return changed(dir);
    }
    const before = kept.get(key)?.checks.last ?? null;
    kept.set(key, {
      tip,
      command: ran,
      checks: { running: true, idle: null, last: before, failedAcs: [], note: null },
      noCommand: false,
    });
    changed(dir);
    const result = await runAt(top, tip, command);
    if (closed) return;
    const passed = result.code === 0;
    const output = passed ? "" : `${result.timedOut ? "Timed out.\n" : ""}${result.output}`;
    const last = { passed, command, at: toIso(now()), output };
    const checks = { running: false, idle: null, last, failedAcs: [], note: null };
    kept.set(key, { tip, command: ran, checks, noCommand: false });
    changed(dir);
  }

  /** Runs feature `id`'s checks at `tip`, unless they ran there with this command or run now. `again` runs them anyway. */
  function request(dir: string, id: string, top: string, tip: string, config: ProjectConfig, again = false) {
    const key = keyOf(dir, id);
    const running = runs.get(key);
    if (running) return running;
    const k = kept.get(key);
    if (!again && k?.tip === tip && k.command === config.checkCommand) return Promise.resolve();
    const run = execute(dir, id, top, tip, config)
      .catch((err: unknown) => {
        const why = err instanceof Error ? err.message : String(err);
        log(`Checks for ${id} failed: ${why}`);
        // A run that threw must not leave the card saying it is still running.
        const last = kept.get(key)?.checks.last ?? null;
        const checks = { running: false, idle: null, last, failedAcs: [], note: `Checks couldn't run: ${why}` };
        kept.set(key, { tip: "", command: null, checks, noCommand: false });
        changed(dir);
      })
      .finally(() => runs.delete(key));
    runs.set(key, run);
    return run;
  }

  return {
    request,

    /** Where feature `id`'s checks stand for `tip`, with the project's check command `command`. */
    verdict(dir: string, id: string, tip: string, command: string | null): FeatureChecks {
      const k = kept.get(keyOf(dir, id));
      if (!k || k.tip !== tip || k.command !== command) return "pending";
      if (k.noCommand) return "no-command";
      if (k.checks.running) return "running";
      return k.checks.last?.passed ? "passed" : "failed";
    },

    /** What the card pane shows of feature `id`'s checks; undefined before any run. */
    checksFor: (dir: string, id: string): CardChecks | undefined => kept.get(keyOf(dir, id))?.checks,

    /** Waits for the runs in flight. */
    idle: async () => {
      while (runs.size) await Promise.all(runs.values());
    },

    close() {
      closed = true;
      for (const control of active) control.cancel();
    },
  };
}

export type FeatureChecksRunner = ReturnType<typeof createFeatureChecks>;
