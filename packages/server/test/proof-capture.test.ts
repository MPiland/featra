/**
 * STORY-25: the screenshots a story's move to review attaches, and Preview, on the real services (story-fixture.ts):
 * a real repository and worktrees, the real agent socket, card reports, proof settings, dev servers and capture. Only
 * the platform is faked: the dev server's process, port probe and HTTP answer, and the desktop host's page capture.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROOF_COPY, type Card, type CardView } from "@featra/work-format";
import type { RunControl, RunResult } from "../src/check-run.ts";
import type { DevServerDeps } from "../src/dev-servers.ts";
import type { CapturePage } from "../src/host-capture.ts";
import { storyWorld, type Client, type StoryWorld } from "./story-fixture.ts";

const CONFIG =
  "maxStoryAgents: 5\nproof: both\ndevServerCommand: pnpm dev --port {port}\ndevServerUrl: http://localhost:5173\ntestScreenshots: shots\n";
const folder = (id: string) => `.featra/evidence/FEAT-2/${id}/`;
const PNG = Buffer.from("page of the dev server");

interface Proc {
  command: string;
  cwd: string;
  cancelled: number;
}

/** The platform: the dev server's processes, whether they answer, and the pages the host captured. */
const platform = {
  procs: [] as Proc[],
  up: true,
  printed: "",
  captured: [] as string[],
};

const noop = () => {};

const devServers: DevServerDeps = {
  run(command, cwd): RunControl {
    const proc: Proc = { command, cwd, cancelled: 0 };
    platform.procs.push(proc);
    let exit: () => void = noop;
    const done = new Promise<RunResult>((resolve) => {
      exit = () => resolve({ code: null, output: "", timedOut: false });
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
  answers: async () => platform.up,
  portFree: async () => true,
  freePort: async () => 49_152,
  // The clock moves only by the server's own waits, so a server that never answers gives up at once.
  wait: async (ms) => {
    clock += ms;
  },
  now: () => clock,
};
let clock = 0;

const capturePage: CapturePage = async (url) => {
  platform.captured.push(url);
  return { ok: true, data: PNG, ext: "png" };
};

let w: StoryWorld;
let lead: Client;
const tree = (name: string) => join(w.repo.main, ".claude", "worktrees", name);
const trees: Record<string, string> = {};

async function update(agent: Client, params: Record<string, unknown>) {
  const id = Math.floor(Math.random() * 1e9);
  agent.socket.send({ id, method: "card.update", params });
  return agent.socket.next((f) => f.id === id);
}

const withCriteria = (c: Card): Card => ({
  ...c,
  acs: [
    { text: "Settings show it", done: false, test: null },
    { text: "A test shows it", done: false, test: null },
  ],
});

/** Spawns story `id` and gives it two criteria; its worktree. */
async function spawned(id: string, name: string) {
  await w.spawnAs({ agent: lead }, id);
  trees[id] = tree(name);
  await w.repo.write(trees[id], withCriteria(await w.card(id, trees[id])));
  return trees[id];
}

async function setConfig(text: string) {
  await writeFile(join(w.dir, ".featra", "config.yaml"), `version: 1\n${text}`);
}

/** Card `id` as the card pane shows it. */
async function view(id: string): Promise<CardView> {
  const watched = await w.window.ask("card.watch", { dir: w.dir, id });
  return watched.result as CardView;
}

beforeAll(async () => {
  w = await storyWorld({ drafted: true, config: CONFIG, proof: { capturePage, devServers } });
  lead = await w.agentOf(w.drafter);
  // The user confirms the dev-server command in Settings, as one written to the config by git must be.
  const confirmed = await w.window.ask("proof.set", { dir: w.dir, patch: { confirm: true } });
  if ((confirmed.result as { unconfirmed?: boolean } | undefined)?.unconfirmed !== false) {
    throw new Error(`The dev-server command wasn't confirmed: ${JSON.stringify(confirmed)}`);
  }
});
afterAll(() => w.close());

describe("AC2: the pages a story's criteria list are captured as it moves to review", () => {
  it("attaches each criterion's page and test screenshot, links them, and tells the agent to commit them", async () => {
    const five = await spawned("STORY-5", "STORY-5-spawn-five");
    await mkdir(join(five, "shots"), { recursive: true });
    await writeFile(join(five, "shots", "STORY-5-ac2-dark.png"), "a test's screenshot");
    const runs = w.claude.runs.length;
    const heard = w.claude.runs.map((r) => r.heard.length);

    const answer = await update(lead, {
      card: "STORY-5",
      criteria: [{ criterion: "Settings show it", page: "/settings" }, { criterion: "A test shows it" }],
      stage: "In Review",
    });

    expect(answer).toMatchObject({ ok: true });
    const said = (answer.result as { changes: string[] }).changes;
    expect(said).toContain("listed 1 page to capture");
    expect(said).toContain(PROOF_COPY.captured(2, folder("STORY-5")));
    expect(platform.procs).toMatchObject([{ command: "pnpm dev --port 5173", cwd: five }]);
    expect(platform.captured).toEqual(["http://localhost:5173/settings"]);

    const card = await w.card("STORY-5", five);
    expect(card.status).toBe("In Review");
    expect(card.acs.map((ac) => ac.evidence)).toEqual([
      `${folder("STORY-5")}ac1-page.png`,
      `${folder("STORY-5")}ac2-test.png`,
    ]);
    expect(card.acs[0]?.page).toBe("/settings");
    expect(await readFile(join(five, ...folder("STORY-5").split("/"), "ac1-page.png"))).toEqual(PNG);
    expect(await readFile(join(five, ...folder("STORY-5").split("/"), "ac2-test.png"), "utf8")).toBe(
      "a test's screenshot",
    );

    // AC4: no agent was started or told anything to capture them.
    expect(w.claude.runs.length).toBe(runs);
    expect(w.claude.runs.map((r) => r.heard.length)).toEqual(heard);
  });

  it("shows the screenshots on the card, with no note and Preview offered", async () => {
    const shown = await view("STORY-5");
    expect(shown.acs.map((ac) => ac.proofNote)).toEqual([undefined, undefined]);
    expect(shown.preview).toBe(true);
  });
});

/** The Dev Lead lists a page for story `id`'s first criterion and moves it to review; the move stands. */
async function moveWithPage(id: string) {
  const answer = await update(lead, {
    card: id,
    criteria: [{ criterion: "Settings show it", page: "/settings" }],
    stage: "In Review",
  });
  expect(answer).toMatchObject({ ok: true });
  expect((await w.card(id, trees[id])).status).toBe("In Review");
  return (await view(id)).acs[0]?.proofNote;
}

describe("a screenshot that can't be taken is a note on the criterion, and the move to review stands", () => {
  it("says the dev-server command isn't confirmed when it changed outside Settings", async () => {
    await spawned("STORY-6", "STORY-6-spawn-six");
    await setConfig(CONFIG.replace("pnpm dev", "npm run dev"));
    const before = platform.procs.length;
    expect(await moveWithPage("STORY-6")).toEqual({ note: PROOF_COPY.notes.unconfirmed });
    expect(platform.procs).toHaveLength(before);
  });

  it("says there is no dev-server command", async () => {
    await spawned("STORY-7", "STORY-7-spawn-seven");
    await setConfig(CONFIG.replace(/devServerCommand:.*\n/, ""));
    expect(await moveWithPage("STORY-7")).toEqual({ note: PROOF_COPY.notes.noCommand });
  });

  it("says the dev server didn't start, with its last output", async () => {
    await spawned("STORY-9", "STORY-9-spawn-9");
    await setConfig(CONFIG);
    platform.up = false;
    platform.printed = "Error: Cannot find module 'vite'\n";
    const captured = platform.captured.length;
    try {
      expect(await moveWithPage("STORY-9")).toEqual({
        note: PROOF_COPY.notes.notStarted,
        output: "Error: Cannot find module 'vite'",
      });
    } finally {
      platform.up = true;
    }
    expect(platform.procs.at(-1)?.cancelled).toBe(1);
    expect(platform.captured).toHaveLength(captured);
  });
});

describe("Preview", () => {
  it("starts the story's dev server, or reuses it, and gives its URL", async () => {
    const before = platform.procs.length;
    const r = await w.window.ask("preview.start", { dir: w.dir, id: "STORY-5" });
    expect(r).toMatchObject({ ok: true, result: { url: "http://localhost:5173" } });
    expect(platform.procs).toHaveLength(before);
  });

  it("says why a dev server didn't start", async () => {
    platform.up = false;
    try {
      const r = await w.window.ask("preview.start", { dir: w.dir, id: "STORY-9" });
      expect(r).toMatchObject({ ok: false, error: `${PROOF_COPY.notes.notStarted}\nError: Cannot find module 'vite'` });
    } finally {
      platform.up = true;
    }
  });

  it("isn't offered when the project's proof leaves it out, or for a story without a worktree", async () => {
    await setConfig(CONFIG.replace("proof: both", "proof: screenshots"));
    expect(await w.window.ask("preview.start", { dir: w.dir, id: "STORY-5" })).toMatchObject({
      ok: false,
      error: PROOF_COPY.noPreview("STORY-5"),
    });
    expect((await view("STORY-5")).preview).toBeUndefined();
    await setConfig(CONFIG);
    expect(await w.window.ask("preview.start", { dir: w.dir, id: "STORY-10" })).toMatchObject({
      ok: false,
      error: PROOF_COPY.noPreview("STORY-10"),
    });
  });
});

describe("the story's dev server stops", () => {
  it("when the story is abandoned, before its worktree goes", async () => {
    const proc = platform.procs[0]!;
    expect(proc.cancelled).toBe(0);
    const check = await w.window.ask("story.abandonCheck", { dir: w.dir, id: "STORY-5" });
    const token = (check.result as { token: string }).token;
    expect(await w.window.ask("story.abandon", { dir: w.dir, id: "STORY-5", keep: false, token })).toMatchObject({
      ok: true,
    });
    expect(proc.cancelled).toBe(1);
  });

  it("when the project closes", async () => {
    expect(await w.window.ask("preview.start", { dir: w.dir, id: "STORY-6" })).toMatchObject({ ok: true });
    const proc = platform.procs.at(-1)!;
    w.allowed.set([]);
    expect(proc.cancelled).toBe(1);
    w.allowed.set([w.dir]);
  });
});
