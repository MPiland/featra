/**
 * The shared world of the STORY-25 proof tests: the real services (story-fixture.ts) with a project whose proof is
 * both, and only the platform faked. The dev server's processes, which answer on their port while they run; its port
 * probe; and the desktop host's page capture, which records what it was asked and answers with a PNG by default.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { AcceptanceCriterion, Card, CardView, ProofNote } from "@featra/work-format";
import type { RunControl, RunResult } from "../src/check-run.ts";
import type { DevServerDeps } from "../src/dev-servers.ts";
import type { Capture, CapturePage } from "../src/host-capture.ts";
import { storyWorld, type Client, type StoryWorld } from "./story-fixture.ts";

export const CONFIG =
  "maxStoryAgents: 9\nproof: both\ndevServerCommand: pnpm dev --port {port}\ndevServerUrl: http://localhost:5173\ntestScreenshots: shots\n";
export const ORIGIN = "http://localhost:5173";
export const folder = (id: string) => `.featra/evidence/FEAT-2/${id}/`;
export const PNG = Buffer.from("page of the dev server");

/** A criterion not done yet, with `extra` as its card line holds it. */
export const criterion = (text: string, extra: Partial<AcceptanceCriterion> = {}): AcceptanceCriterion => ({
  text,
  done: false,
  test: null,
  ...extra,
});
export const TWO = [criterion("Settings show it"), criterion("A test shows it")];

export interface Proc {
  command: string;
  cwd: string;
  port: string;
  cancelled: number;
  ended: boolean;
}

const noop = () => {};

/** Proof worlds share one platform: tests in a file run in order, and each starts its own story. */
export const platform = {
  procs: [] as Proc[],
  /** False: no dev server ever answers. */
  up: true,
  printed: "",
  /** What the host was asked to capture: the page's URL and the dev server's origin. */
  captured: [] as { url: string; origin: string }[],
  /** The host's answer to each page, by its path on the dev server; a PNG when not given. */
  shots: new Map<string, Capture>(),
  /** While set, each capture answers only once it settles: a capture held open (STORY-73). */
  hold: null as Promise<void> | null,
};

let clock = 0;

const devServers: DevServerDeps = {
  run(command, cwd, env): RunControl {
    const proc: Proc = { command, cwd, port: env.PORT ?? "", cancelled: 0, ended: false };
    platform.procs.push(proc);
    let exit: () => void = noop;
    const done = new Promise<RunResult>((resolve) => {
      exit = () => {
        proc.ended = true;
        resolve({ code: null, output: "", timedOut: false });
      };
    });
    return {
      cancel: () => {
        proc.cancelled++;
        exit();
      },
      done,
      output: () => platform.printed,
    };
  },
  // A URL answers while a dev server started on its port runs.
  answers: async (url) => platform.up && platform.procs.some((p) => !p.ended && p.port === new URL(url).port),
  portFree: async () => true,
  freePort: async () => 49_152,
  // The clock moves only by the server's own waits, so a server that never answers gives up at once.
  wait: async (ms) => {
    clock += ms;
  },
  now: () => clock,
};

const capturePage: CapturePage = async (url, origin) => {
  platform.captured.push({ url, origin });
  if (platform.hold) await platform.hold;
  return platform.shots.get(new URL(url).pathname) ?? { ok: true, data: PNG, ext: "png" };
};

/** The faked platform behind a project's proof, for a world of its own (STORY-73). */
export const proofPlatform = { capturePage, devServers };

/** A proof world: the project, its Dev Lead's agent socket, and what its tests do with stories. */
export async function proofWorld() {
  const w: StoryWorld = await storyWorld({ drafted: true, config: CONFIG, proof: { capturePage, devServers } });
  const lead: Client = await w.agentOf(w.drafter);
  // The user confirms the dev-server command in Settings, as one written to the config by git must be.
  const confirmed = await w.window.ask("proof.set", { dir: w.dir, patch: { confirm: true } });
  if ((confirmed.result as { unconfirmed?: boolean } | undefined)?.unconfirmed !== false) {
    throw new Error(`The dev-server command wasn't confirmed: ${JSON.stringify(confirmed)}`);
  }
  const trees: Record<string, string> = {};

  async function update(params: Record<string, unknown>) {
    const id = Math.floor(Math.random() * 1e9);
    lead.socket.send({ id, method: "card.update", params });
    return lead.socket.next((f) => f.id === id);
  }

  /** Spawns story `id` (its worktree `name`) and gives it criteria; its worktree. */
  async function spawned(id: string, name: string, acs: AcceptanceCriterion[] = TWO) {
    await w.spawnAs({ agent: lead }, id);
    trees[id] = join(w.repo.main, ".claude", "worktrees", name);
    await w.repo.write(trees[id], { ...(await w.card(id, trees[id])), acs } satisfies Card);
    return trees[id];
  }

  const setConfig = (text: string) => writeFile(join(w.dir, ".featra", "config.yaml"), `version: 1\n${text}`);

  /** Card `id` as the card pane shows it. */
  async function view(id: string): Promise<CardView> {
    const watched = await w.window.ask("card.watch", { dir: w.dir, id });
    return watched.result as CardView;
  }

  /** The Dev Lead lists a page for story `id`'s first criterion and moves it to review; the move stands. */
  async function moveWithPage(id: string): Promise<ProofNote | undefined> {
    const answer = await update({
      card: id,
      criteria: [{ criterion: "Settings show it", page: "/settings" }],
      stage: "In Review",
    });
    expect(answer).toMatchObject({ ok: true });
    expect((await w.card(id, trees[id])).status).toBe("In Review");
    return (await view(id)).acs[0]?.proofNote;
  }

  return { w, lead, trees, update, spawned, setConfig, view, moveWithPage };
}
