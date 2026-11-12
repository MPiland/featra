/**
 * Local checks (STORY-56): when checks run on this computer, Featra runs the project's check command in a story's
 * worktree when the story reaches review and when new commits land there, and each linked test of its acceptance
 * criteria. The evidence goes to the card's owner copy, by `system` (ADR 0004).
 *
 * One run per worktree at a time: a request that arrives while one runs queues behind it (at most one, so a burst of
 * commits runs once more), and the run it makes stale is thrown away. Runs cost no tokens and never block the server.
 */
import { CHECKS_COPY, checksApply, checksWhere, toIso, type CardChecks, type CheckOutcome } from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import { ApiError } from "./api-error.ts";
import { ownedIn } from "./card-actions.ts";
import { recordEvidence } from "./check-evidence.ts";
import { locationKey } from "./collect.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import { runCommand, type RunControl, type RunResult } from "./check-run.ts";
import type { CheckSettings } from "./check-settings.ts";
import { LINKED_NOTES, runLinkedTests } from "./linked-tests.ts";
import { watchProjects } from "./project-watch.ts";
import type { Scan } from "./work-scan.ts";
import type { WorkWatches } from "./work-watch.ts";

export interface StoryChecksDeps {
  scan: (dir: string) => Promise<Scan | null>;
  observe: WorkWatches["observe"];
  allowed: Pick<AllowedProjects, "dirs" | "has" | "onChange">;
  settings: Pick<CheckSettings, "github" | "confirmed">;
  now: () => Date;
  lane?: CardLane;
  log: (message: string) => void;
  /** How many commands run at once, across all stories and projects; two by default. */
  limit?: number;
  /** How long one command may run before it is killed. */
  timeoutMs?: number;
}

/** A story the checks apply to: its id, and what a new run depends on (its stage and its worktree's HEAD). */
interface Reviewed {
  id: string;
  trigger: string;
}

const NOTES = {
  gone: "That story isn't in review here.",
  ci: "Checks run in CI for this project.",
  checkChanged:
    "The check command was changed in the project's config. Confirm it in Project settings; nothing runs until then.",
  testChanged: "The linked test command was changed in the project's config. Confirm it in Project settings.",
  failed: "Checks couldn't run: ",
} as const;

const keyOf = (dir: string, id: string) => `${dir}\0${id}`;
const blank = (): CardChecks => ({ running: false, idle: null, last: null, failedAcs: [], note: null });

/** The stories of `scan` whose checks run in their own worktree now. */
function reviewed(scan: Scan | null): Reviewed[] {
  if (!scan) return [];
  const { config, git } = scan.collected;
  return scan.resolution.cards.flatMap(({ card, owner }) => {
    if (owner.kind !== "worktree" || !checksApply(card, config)) return [];
    const head = git.trees.find((t) => t.path === scan.collected.roots.get(locationKey(owner)))?.head;
    return [{ id: card.id, trigger: `${card.status}@${head ?? ""}` }];
  });
}

export function createStoryChecks({
  scan: scanDir,
  observe,
  allowed,
  settings,
  now,
  lane = createCardLane(),
  log,
  limit = 2,
  timeoutMs,
}: StoryChecksDeps) {
  const states = new Map<string, CardChecks>();
  const slots = new Map<string, { pending: boolean; settled: Promise<void> }>();
  const active = new Set<RunControl>();
  let closed = false;
  const isClosed = () => closed;
  let free = limit;
  const waiting: (() => void)[] = [];

  const turn = async () => {
    if (free > 0) free--;
    else await new Promise<void>((go) => waiting.push(go));
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else free++;
  };

  const run = async (command: string, cwd: string): Promise<RunResult> => {
    await turn();
    try {
      const control = runCommand(command, cwd, timeoutMs);
      active.add(control);
      const result = await control.done;
      active.delete(control);
      return result;
    } finally {
      release();
    }
  };

  const show = async (dir: string, id: string, next: CardChecks) => {
    states.set(keyOf(dir, id), next);
    if (!closed) await scanDir(dir);
  };

  /** The evidence of `outcome` on the story's owner copy, read fresh in the lane; false when the story left review. */
  const record = (dir: string, id: string, outcome: CheckOutcome) =>
    recordEvidence({ scan: scanDir, lane, now }, dir, id, outcome);

  /** One run: null when it ran, else why not. The result is written only if nothing newer was asked for meanwhile. */
  async function execute(dir: string, id: string, stale: () => boolean): Promise<string | null> {
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    const config = scan?.collected.config;
    if (!scan || !config || !found?.root || found.owned.owner.kind !== "worktree") return NOTES.gone;
    if (!checksApply(found.owned.card, config)) return NOTES.gone;
    if (checksWhere(config, await settings.github(dir)) !== "local") return NOTES.ci;
    const trusted = await settings.confirmed(dir, config);
    if (config.checkCommand === null || trusted.command === null) {
      const idle = config.checkCommand === null ? CHECKS_COPY.noCommand : NOTES.checkChanged;
      await show(dir, id, { ...blank(), idle });
      return null;
    }
    const checkCommand = trusted.command;
    const before = states.get(keyOf(dir, id)) ?? blank();
    await show(dir, id, { ...before, running: true, idle: null });
    const main = await run(checkCommand, found.root);
    const linked = await runLinkedTests({
      card: found.owned.card,
      template: trusted.testCommand,
      without: config.linkedTestCommand === null ? LINKED_NOTES.noTemplate : NOTES.testChanged,
      root: found.root,
      run,
      stale,
    });
    if (stale() || closed) return null;
    const passed = main.code === 0;
    const output = passed ? linked.failures : `${main.timedOut ? "Timed out.\n" : ""}${main.output}`;
    if (!(await record(dir, id, { passed, acs: linked.acs }))) {
      // The story left review while this ran: there is nothing to show for it.
      states.delete(keyOf(dir, id));
      return null;
    }
    await show(dir, id, {
      running: false,
      idle: null,
      last: { passed, command: checkCommand, at: toIso(now()), output },
      failedAcs: linked.acs.filter((a) => !a.passed).map((a) => a.ac),
      note: linked.note,
    });
    return null;
  }

  /** Asks for a run of story `id`; one already running makes this one wait behind it. Resolves once it has settled. */
  function request(dir: string, id: string): Promise<string | null> {
    const key = keyOf(dir, id);
    const slot = slots.get(key);
    if (slot) {
      slot.pending = true;
      return slot.settled.then(() => null);
    }
    const mine = { pending: false, settled: Promise.resolve() };
    let refusal: string | null = null;
    mine.settled = (async () => {
      do {
        mine.pending = false;
        try {
          refusal = await execute(dir, id, () => mine.pending);
        } catch (err) {
          const why = err instanceof Error ? err.message : String(err);
          log(`Checks for ${id} failed: ${why}`);
          // A run that threw must not leave the card saying it is still running.
          states.set(key, {
            ...(states.get(key) ?? blank()),
            running: false,
            idle: null,
            note: `${NOTES.failed}${why}`,
          });
          await scanDir(dir).catch(() => null);
          refusal = null;
        }
      } while (mine.pending && !isClosed());
      slots.delete(key);
    })();
    slots.set(key, mine);
    return mine.settled.then(() => refusal);
  }

  // What each project's stories were last seen as, so a stage or HEAD that changed starts a run and nothing else does.
  const seen = new Map<string, string>();

  async function watchProject(dir: string) {
    let baseline = true;
    const consider = (items: Reviewed[]) => {
      const present = new Set(items.map((s) => keyOf(dir, s.id)));
      for (const key of seen.keys()) {
        if (!key.startsWith(`${dir}\0`) || present.has(key)) continue;
        seen.delete(key);
        // A story that left review has no checks to show (one still running is cleared when it ends).
        if (!slots.has(key)) states.delete(key);
      }
      for (const s of items) {
        const key = keyOf(dir, s.id);
        const changed = seen.get(key) !== s.trigger;
        seen.set(key, s.trigger);
        if (changed && !baseline) void request(dir, s.id);
      }
    };
    const { value, stop } = await observe(dir, (scan) => reviewed(scan), consider);
    consider(value);
    baseline = false;
    return stop;
  }

  const projects = watchProjects(allowed, watchProject, log, "Checks");

  return {
    /** What the card pane shows of story `id`'s checks, or undefined before any run or idle note. */
    checksFor: (dir: string, id: string): CardChecks | undefined => states.get(keyOf(dir, id)),

    /** Runs the checks of story `id` again now (the card's Re-run); refused when they don't run here or the story isn't in review. */
    async rerun(dir: string, id: string): Promise<null> {
      const refusal = await request(dir, id);
      if (refusal !== null) throw new ApiError(refusal);
      return null;
    },

    /** Waits for the runs in flight. */
    idle: async () => {
      while (slots.size) await Promise.all([...slots.values()].map((s) => s.settled));
    },

    close() {
      closed = true;
      projects.close();
      for (const control of active) control.cancel();
    },
  };
}

export type StoryChecks = ReturnType<typeof createStoryChecks>;
