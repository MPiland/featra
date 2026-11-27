/**
 * STORY-74: the Browser pane's dev servers on the real services (proof-world.ts): a story's in its worktree, a
 * feature's in a temporary checkout of its branch, reused when running, and stopped on close only when the pane's own
 * start launched them. Only the platform is faked: the dev server's process, port probe and HTTP answer.
 */
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROOF_COPY } from "@featra/work-format";
import { platform, proofWorld } from "./proof-world.ts";

let p: Awaited<ReturnType<typeof proofWorld>>;

beforeAll(async () => {
  p = await proofWorld();
});
afterAll(() => p.w.close());

const start = (id: string) => p.w.window.ask("browser.start", { dir: p.w.dir, id });
const stop = (id: string) => p.w.window.ask("browser.stop", { dir: p.w.dir, id });

describe("The Browser pane's dev server", () => {
  it("starts a story's dev server in its worktree, gives its URL, and stops it when the pane closes", async () => {
    const tree = await p.spawned("STORY-5", "STORY-5-spawn-five");
    expect((await p.view("STORY-5")).browser).toBe(true);
    const before = platform.procs.length;
    expect(await start("STORY-5")).toMatchObject({ ok: true, result: { url: "http://localhost:5173" } });
    expect(platform.procs).toHaveLength(before + 1);
    const proc = platform.procs.at(-1)!;
    expect(proc.cwd).toBe(tree);
    expect(proc.command).toBe("pnpm dev --port 5173");
    // Opened again: the running one.
    expect(await start("STORY-5")).toMatchObject({ ok: true });
    expect(platform.procs).toHaveLength(before + 1);
    expect(await stop("STORY-5")).toMatchObject({ ok: true, result: null });
    expect(proc.cancelled).toBe(1);
    expect(proc.ended).toBe(true);
  });

  it("reuses a dev server Preview started, and leaves it running when the pane closes", async () => {
    await p.spawned("STORY-6", "STORY-6-spawn-six");
    expect(await p.w.window.ask("preview.start", { dir: p.w.dir, id: "STORY-6" })).toMatchObject({ ok: true });
    const before = platform.procs.length;
    const proc = platform.procs.at(-1)!;
    expect(await start("STORY-6")).toMatchObject({ ok: true });
    expect(platform.procs).toHaveLength(before);
    expect(await stop("STORY-6")).toMatchObject({ ok: true });
    expect(proc.cancelled).toBe(0);
    expect(proc.ended).toBe(false);
    // Its story ends, which stops it, so the next server here gets the configured port.
    p.w.services.devServers.stop(p.w.dir, "STORY-6");
  });

  it("serves a feature in progress from a temporary checkout of its branch, removed when the pane closes", async () => {
    expect((await p.view("FEAT-2")).browser).toBe(true);
    const before = platform.procs.length;
    expect(await start("FEAT-2")).toMatchObject({ ok: true, result: { url: "http://localhost:5173" } });
    expect(platform.procs).toHaveLength(before + 1);
    const proc = platform.procs.at(-1)!;
    expect(basename(proc.cwd)).toMatch(/^featra-feature-preview-/);
    // The checkout is the feature branch's tip: its cards are there.
    expect(existsSync(`${proc.cwd}/.featra`)).toBe(true);
    expect(p.w.repo.git(p.w.dir, "worktree", "list")).toContain(basename(proc.cwd));
    expect(await stop("FEAT-2")).toMatchObject({ ok: true });
    expect(proc.cancelled).toBe(1);
    expect(existsSync(proc.cwd)).toBe(false);
    expect(p.w.repo.git(p.w.dir, "worktree", "list")).not.toContain(basename(proc.cwd));
  });

  it("removes a feature's checkout when its dev server didn't start, and says why", async () => {
    platform.up = false;
    platform.printed = "Error: Cannot find module 'vite'\n";
    try {
      const before = platform.procs.length;
      const r = await start("FEAT-2");
      expect(r).toMatchObject({ ok: false, error: `${PROOF_COPY.notes.notStarted}\nError: Cannot find module 'vite'` });
      const proc = platform.procs[before]!;
      expect(existsSync(proc.cwd)).toBe(false);
    } finally {
      platform.up = true;
      platform.printed = "";
    }
  });

  it("refuses a story without a worktree of its own, whose card doesn't offer it", async () => {
    expect(await start("STORY-7")).toMatchObject({ ok: false, error: PROOF_COPY.noBrowser("STORY-7") });
    expect((await p.view("STORY-7")).browser).toBeUndefined();
  });

  it("stops what a start still under way launches when the pane closes meanwhile", async () => {
    await p.spawned("STORY-9", "STORY-9-spawn-9");
    const before = platform.procs.length;
    const opening = start("STORY-9");
    const closing = stop("STORY-9");
    expect(await opening).toMatchObject({ ok: true });
    expect(await closing).toMatchObject({ ok: true });
    const proc = platform.procs[before]!;
    expect(proc.cancelled).toBe(1);
  });

  it("starts again after a close sent meanwhile, as a pane closed and opened at once does", async () => {
    await p.spawned("STORY-10", "STORY-10-spawn-10");
    const before = platform.procs.length;
    const [first, closed, second] = await Promise.all([start("STORY-10"), stop("STORY-10"), start("STORY-10")]);
    expect([first.ok, closed.ok, second.ok]).toEqual([true, true, true]);
    expect(platform.procs).toHaveLength(before + 2);
    expect(platform.procs[before]!.cancelled).toBe(1);
    expect(platform.procs[before + 1]!.ended).toBe(false);
    expect(await stop("STORY-10")).toMatchObject({ ok: true });
    expect(platform.procs[before + 1]!.ended).toBe(true);
  });
});
