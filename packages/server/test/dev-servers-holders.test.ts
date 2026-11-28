/**
 * STORY-74: who holds a story's dev server (dev-servers.ts). Preview, the screenshots and each open Browser pane hold
 * it; a release stops it only when it was the last, and says whether its process has ended, waiting a bounded time.
 * The process, the port probe, HTTP and the clock are faked at their boundary.
 */
import { describe, expect, it } from "vitest";
import type { RunControl, RunResult } from "../src/check-run.ts";
import { createDevServers } from "../src/dev-servers.ts";

const noop = () => {};
const DIR = "D:/p";
const TREE = "D:/p/.claude/worktrees/STORY-1-x";
const URL = "http://localhost:5173";

/** Processes that answer while they run; `lingers` keeps a cancelled one running until `exit` is called. */
function platform(lingers = false) {
  const procs: { cancelled: number; ended: boolean; exit: () => void }[] = [];
  let clock = 0;
  const servers = createDevServers({
    run(): RunControl {
      const proc = { cancelled: 0, ended: false, exit: noop };
      const done = new Promise<RunResult>((resolve) => {
        proc.exit = () => {
          proc.ended = true;
          resolve({ code: null, output: "", timedOut: false });
        };
      });
      procs.push(proc);
      return {
        cancel: () => {
          proc.cancelled++;
          if (!lingers) proc.exit();
        },
        done,
        output: () => "",
      };
    },
    answers: async () => procs.some((p) => !p.ended),
    portFree: async () => true,
    wait: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
  return { servers, procs, elapsed: () => clock };
}

describe("a dev server's holders", () => {
  it("keep it running until the last lets go", async () => {
    const { servers, procs } = platform();
    const pane = servers.claim(DIR, "STORY-1", TREE, "pnpm dev", URL, "browser:a");
    expect(pane.launched).toBe(true);
    expect(await pane.started).toEqual({ ok: true, url: URL });
    const preview = servers.claim(DIR, "STORY-1", TREE, "pnpm dev", URL, "preview");
    expect(preview.launched).toBe(false);
    expect(await preview.started).toEqual({ ok: true, url: URL });

    expect(await servers.release(DIR, "STORY-1", "browser:a")).toBe(false);
    expect(servers.running(DIR, "STORY-1")).toBe(true);
    expect(procs[0]!.cancelled).toBe(0);

    expect(await servers.release(DIR, "STORY-1", "preview")).toBe(true);
    expect(servers.running(DIR, "STORY-1")).toBe(false);
    expect(procs[0]).toMatchObject({ cancelled: 1, ended: true });
  });

  it("are counted once each: a holder claiming again still lets go with one release", async () => {
    const { servers, procs } = platform();
    await servers.start(DIR, "STORY-1", TREE, "pnpm dev", URL, "preview");
    await servers.start(DIR, "STORY-1", TREE, "pnpm dev", URL, "preview");
    expect(await servers.release(DIR, "STORY-1", "preview")).toBe(true);
    expect(procs[0]!.ended).toBe(true);
  });

  it("wait only so long for the last one's process to end, and say it hasn't", async () => {
    const { servers, procs, elapsed } = platform(true);
    await servers.start(DIR, "STORY-1", TREE, "pnpm dev", URL, "browser:a");
    const before = elapsed();
    expect(await servers.release(DIR, "STORY-1", "browser:a", 3000)).toBe(false);
    expect(elapsed() - before).toBe(3000);
    expect(procs[0]).toMatchObject({ cancelled: 1, ended: false });
    procs[0]!.exit();
    // Ended now: a release finds nothing left running.
    expect(await servers.release(DIR, "STORY-1", "browser:a", 3000)).toBe(true);
  });

  it("are all let go when the app quits: stopAll stops a server whoever holds it", async () => {
    const { servers, procs } = platform();
    await servers.start(DIR, "STORY-1", TREE, "pnpm dev", URL, "preview");
    await servers.start(DIR, "STORY-1", TREE, "pnpm dev", URL, "browser:a");
    servers.stopAll();
    expect(procs[0]).toMatchObject({ cancelled: 1, ended: true });
    expect(await servers.release(DIR, "STORY-1", "browser:a", 3000)).toBe(true);
  });
});
