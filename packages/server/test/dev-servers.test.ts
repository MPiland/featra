/**
 * STORY-25: a story's dev server (dev-servers.ts, ADR 0044). One per story, started in its worktree with the project's
 * command and reused; a port taken is moved when the command takes {port}; a server that doesn't answer in time is
 * stopped with a note showing its last output; and Featra stops only the servers it started. The process, the port
 * probe, HTTP and the clock are faked at their boundary; dev-servers-real.test.ts runs the real ones.
 */
import { describe, expect, it } from "vitest";
import { PROOF_COPY } from "@featra/work-format";
import type { RunControl, RunResult } from "../src/check-run.ts";
import { createDevServers, type DevServerDeps } from "../src/dev-servers.ts";

interface Spawned {
  command: string;
  cwd: string;
  env: Readonly<Record<string, string>>;
  cancelled: number;
  printed: string;
  ended: boolean;
  exit: () => void;
  done: Promise<RunResult>;
}

/** Processes that run until cancelled or told to exit, a clock that moves only by the server's own waits. */
const noop = () => {};

function platform(options: { up?: (url: string) => boolean; taken?: number[]; startMs?: number } = {}) {
  const spawned: Spawned[] = [];
  const asked: string[] = [];
  let clock = 0;
  const deps: DevServerDeps = {
    run(command, cwd, env) {
      let exit: () => void = noop;
      const done = new Promise<RunResult>((resolve) => {
        exit = () => {
          proc.ended = true;
          resolve({ code: 0, output: "", timedOut: false });
        };
      });
      const proc: Spawned = { command, cwd, env, cancelled: 0, printed: "", ended: false, exit, done };
      spawned.push(proc);
      const control: RunControl = {
        cancel: () => {
          proc.cancelled++;
          proc.exit();
        },
        done,
        output: () => proc.printed,
      };
      return control;
    },
    // By default a URL answers while a process started on its port runs: nothing answers before one starts.
    answers: async (url) => {
      asked.push(url);
      return (options.up ?? ((u) => spawned.some((s) => !s.ended && s.env.PORT === new URL(u).port)))(url);
    },
    portFree: async (port) => !(options.taken ?? []).includes(port),
    freePort: async () => 49_152,
    wait: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    startMs: options.startMs ?? 2000,
  };
  return { deps, spawned, asked, elapsed: () => clock };
}

const DIR = "D:/p";
const TREE = "D:/p/.claude/worktrees/STORY-1-x";

describe("a story's dev server", () => {
  it("starts in the story's worktree with the command, and is reused while it runs", async () => {
    const p = platform();
    const servers = createDevServers(p.deps);
    const first = await servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(first).toEqual({ ok: true, url: "http://localhost:5173" });
    expect(p.spawned).toMatchObject([{ command: "pnpm dev", cwd: TREE, env: { PORT: "5173" } }]);
    expect(servers.running(DIR, "STORY-1")).toBe(true);

    const again = await servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(again).toEqual(first);
    expect(p.spawned).toHaveLength(1);
  });

  it("starts once when asked twice at the same time", async () => {
    const p = platform();
    const servers = createDevServers(p.deps);
    const both = await Promise.all([
      servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173"),
      servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173"),
    ]);
    expect(both.map((r) => r.ok)).toEqual([true, true]);
    expect(p.spawned).toHaveLength(1);
  });

  it("runs one per story", async () => {
    const p = platform();
    const servers = createDevServers(p.deps);
    await servers.start(DIR, "STORY-1", TREE, "pnpm dev --port {port}", "http://localhost:5173");
    await servers.start(
      DIR,
      "STORY-2",
      `${DIR}/.claude/worktrees/STORY-2-y`,
      "pnpm dev --port {port}",
      "http://localhost:5173",
    );
    expect(p.spawned.map((s) => s.cwd)).toEqual([TREE, `${DIR}/.claude/worktrees/STORY-2-y`]);
  });

  it("is moved to a free port when its own is taken and the command takes {port}", async () => {
    const p = platform({ taken: [5173] });
    const servers = createDevServers(p.deps);
    const r = await servers.start(DIR, "STORY-1", TREE, "vite --port {port} --strictPort", "http://localhost:5173/");
    expect(r).toEqual({ ok: true, url: "http://localhost:49152" });
    expect(p.spawned).toMatchObject([{ command: "vite --port 49152 --strictPort", env: { PORT: "49152" } }]);
  });

  it("keeps its own port when free, and puts it in for {port}", async () => {
    const p = platform();
    const servers = createDevServers(p.deps);
    await servers.start(DIR, "STORY-1", TREE, "vite --port {port}", "http://127.0.0.1:3000");
    expect(p.spawned[0]?.command).toBe("vite --port 3000");
  });

  it("isn't started when its port is taken and the command can't be moved, and says so", async () => {
    const p = platform({ taken: [5173] });
    const servers = createDevServers(p.deps);
    const r = await servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(r).toEqual({ ok: false, note: PROOF_COPY.notes.portTaken(5173) });
    expect(PROOF_COPY.notes.portTaken(5173)).toMatch(/5173/);
    expect(p.spawned).toHaveLength(0);
  });

  it("isn't started without a port in its URL", async () => {
    const p = platform();
    const r = await createDevServers(p.deps).start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost");
    expect(r).toEqual({ ok: false, note: PROOF_COPY.notes.noUrl });
    expect(p.spawned).toHaveLength(0);
  });

  it("treats its port as taken when something answers on its URL before it starts", async () => {
    const p = platform({ up: () => true });
    const r = await createDevServers(p.deps).start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(r).toEqual({ ok: false, note: PROOF_COPY.notes.portTaken(5173) });
    expect(p.spawned).toHaveLength(0);

    const moved = await createDevServers(p.deps).start(
      DIR,
      "STORY-2",
      TREE,
      "vite --port {port}",
      "http://localhost:5173",
    );
    expect(moved).toEqual({ ok: true, url: "http://localhost:49152" });
    expect(p.spawned.map((s) => s.command)).toEqual(["vite --port 49152"]);
  });

  it("didn't start when its own process ended before its URL answered: what answers isn't it", async () => {
    const p = platform();
    const deps: DevServerDeps = {
      ...p.deps,
      answers: async () => {
        const proc = p.spawned.at(-1);
        if (!proc) return false;
        proc.exit();
        return true;
      },
    };
    const servers = createDevServers(deps);
    const r = await servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(r).toMatchObject({ ok: false, note: PROOF_COPY.notes.notStarted });
    expect(servers.running(DIR, "STORY-1")).toBe(false);
  });

  it("is asked on its URL until it answers", async () => {
    let asks = 0;
    const p = platform({ up: () => ++asks >= 3 });
    const r = await createDevServers(p.deps).start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(r.ok).toBe(true);
    expect(p.asked).toEqual(["http://localhost:5173", "http://localhost:5173", "http://localhost:5173"]);
  });
});

describe("a dev server that doesn't start", () => {
  it("is stopped after the time it has, with a note showing its last 20 lines", async () => {
    const p = platform({ up: () => false, startMs: 2000 });
    const servers = createDevServers(p.deps);
    const r = await servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(r).toMatchObject({ ok: false, note: PROOF_COPY.notes.notStarted });
    expect(p.elapsed()).toBeGreaterThanOrEqual(2000);
    expect(p.spawned[0]?.cancelled).toBe(1);
    expect(servers.running(DIR, "STORY-1")).toBe(false);
  });

  it("shows only the last 20 lines of what it printed", async () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`);
    const p = platform({ startMs: 1000 });
    const deps: DevServerDeps = {
      ...p.deps,
      answers: async () => {
        const proc = p.spawned[0];
        if (proc) proc.printed = `${lines.join("\n")}\n`;
        return false;
      },
    };
    const r = await createDevServers(deps).start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(r).toEqual({ ok: false, note: PROOF_COPY.notes.notStarted, output: lines.slice(5).join("\n") });
  });

  it("isn't killed once it has exited by itself, and is started again on the next ask", async () => {
    const p = platform();
    const deps: DevServerDeps = {
      ...p.deps,
      answers: async () => {
        p.spawned.at(-1)?.exit();
        return false;
      },
    };
    const servers = createDevServers(deps);
    const r = await servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(r).toMatchObject({ ok: false, note: PROOF_COPY.notes.notStarted });
    expect(p.spawned[0]?.cancelled).toBe(0);

    await servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(p.spawned).toHaveLength(2);
  });

  it("is started again when the one that ran has since exited", async () => {
    const p = platform();
    const servers = createDevServers(p.deps);
    await servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    p.spawned[0]?.exit();
    await p.spawned[0]?.done;
    expect(servers.running(DIR, "STORY-1")).toBe(false);
    await servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(p.spawned).toHaveLength(2);
    expect(p.spawned[0]?.cancelled).toBe(0);
  });
});

/** Three running dev servers: two stories of project D:/a and one of D:/b. */
async function three() {
  const p = platform();
  const servers = createDevServers(p.deps);
  await servers.start("D:/a", "STORY-1", "D:/a/w1", "dev", "http://localhost:5173");
  await servers.start("D:/a", "STORY-2", "D:/a/w2", "dev", "http://localhost:5174");
  await servers.start("D:/b", "STORY-1", "D:/b/w1", "dev", "http://localhost:5175");
  return { p, servers, cancelled: () => p.spawned.map((s) => s.cancelled) };
}

describe("stopping dev servers", () => {
  it("stops only the story's when it ends", async () => {
    const { servers, cancelled } = await three();
    servers.stop("D:/a", "STORY-1");
    servers.stop("D:/a", "STORY-1");
    servers.stop("D:/c", "STORY-9");
    expect(cancelled()).toEqual([1, 0, 0]);
    expect(servers.running("D:/a", "STORY-1")).toBe(false);
    expect(servers.running("D:/b", "STORY-1")).toBe(true);
  });

  it("stops a closed project's, and keeps the open ones'", async () => {
    const { servers, cancelled } = await three();
    servers.keepProjects(["D:/b"]);
    expect(cancelled()).toEqual([1, 1, 0]);
  });

  it("stops every one when the app quits", async () => {
    const { servers, cancelled } = await three();
    servers.stopAll();
    expect(cancelled()).toEqual([1, 1, 1]);
  });

  it("never spawns one stopped while its port was still being checked", async () => {
    const p = platform();
    let probed: () => void = noop;
    const probing = new Promise<void>((resolve) => {
      probed = resolve;
    });
    const deps: DevServerDeps = { ...p.deps, portFree: () => probing.then(() => true) };
    const servers = createDevServers(deps);
    const starting = servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    servers.stopAll();
    probed();
    expect(await starting).toMatchObject({ ok: false, note: PROOF_COPY.notes.notStarted });
    expect(p.spawned).toHaveLength(0);
  });

  it("stops one still starting, and doesn't stop it twice", async () => {
    const p = platform({ up: () => false, startMs: 60_000 });
    let servers = createDevServers(p.deps);
    const deps: DevServerDeps = {
      ...p.deps,
      answers: async () => {
        if (p.spawned.length) servers.stop(DIR, "STORY-1");
        return false;
      },
    };
    servers = createDevServers(deps);
    const r = await servers.start(DIR, "STORY-1", TREE, "pnpm dev", "http://localhost:5173");
    expect(r.ok).toBe(false);
    expect(p.spawned[0]?.cancelled).toBe(1);
  });
});
