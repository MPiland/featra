/**
 * STORY-25: Preview, and when a story's dev server stops, on the real services (proof-world.ts). Each test starts its
 * own story and its own dev server, so none depends on another's. Only the platform is faked: the dev server's
 * process, port probe and HTTP answer.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROOF_COPY } from "@featra/work-format";
import { CONFIG, platform, proofWorld } from "./proof-world.ts";

let p: Awaited<ReturnType<typeof proofWorld>>;

beforeAll(async () => {
  p = await proofWorld();
});
afterAll(() => p.w.close());

/** Story `id` spawned in worktree `name`, with its dev server started by Preview; that server's process. */
async function previewed(id: string, name: string) {
  await p.spawned(id, name);
  const before = platform.procs.length;
  expect(await p.w.window.ask("preview.start", { dir: p.w.dir, id })).toMatchObject({ ok: true });
  expect(platform.procs).toHaveLength(before + 1);
  const proc = platform.procs.at(-1)!;
  expect(proc.cancelled).toBe(0);
  return proc;
}

describe("Preview", () => {
  it("starts the story's dev server, then reuses it, and gives its URL", async () => {
    await p.spawned("STORY-5", "STORY-5-spawn-five");
    const before = platform.procs.length;
    const first = await p.w.window.ask("preview.start", { dir: p.w.dir, id: "STORY-5" });
    expect(first).toMatchObject({ ok: true, result: { url: "http://localhost:5173" } });
    const again = await p.w.window.ask("preview.start", { dir: p.w.dir, id: "STORY-5" });
    expect(again).toMatchObject({ ok: true, result: { url: "http://localhost:5173" } });
    expect(platform.procs).toHaveLength(before + 1);
  });

  it("says why a dev server didn't start", async () => {
    await p.spawned("STORY-9", "STORY-9-spawn-9");
    platform.up = false;
    platform.printed = "Error: Cannot find module 'vite'\n";
    try {
      const r = await p.w.window.ask("preview.start", { dir: p.w.dir, id: "STORY-9" });
      expect(r).toMatchObject({ ok: false, error: `${PROOF_COPY.notes.notStarted}\nError: Cannot find module 'vite'` });
    } finally {
      platform.up = true;
      platform.printed = "";
    }
  });

  it("isn't offered when the project's proof leaves it out, or for a story without a worktree", async () => {
    await p.spawned("STORY-11", "STORY-11-spawn-11");
    await p.setConfig(CONFIG.replace("proof: both", "proof: screenshots"));
    try {
      expect(await p.w.window.ask("preview.start", { dir: p.w.dir, id: "STORY-11" })).toMatchObject({
        ok: false,
        error: PROOF_COPY.noPreview("STORY-11"),
      });
      expect((await p.view("STORY-11")).preview).toBeUndefined();
    } finally {
      await p.setConfig(CONFIG);
    }
    expect((await p.view("STORY-11")).preview).toBe(true);
    expect(await p.w.window.ask("preview.start", { dir: p.w.dir, id: "STORY-10" })).toMatchObject({
      ok: false,
      error: PROOF_COPY.noPreview("STORY-10"),
    });
  });
});

describe("the story's dev server stops", () => {
  it("when the story is abandoned, before its worktree goes", async () => {
    const proc = await previewed("STORY-12", "STORY-12-spawn-12");
    const check = await p.w.window.ask("story.abandonCheck", { dir: p.w.dir, id: "STORY-12" });
    const token = (check.result as { token: string }).token;
    expect(await p.w.window.ask("story.abandon", { dir: p.w.dir, id: "STORY-12", keep: false, token })).toMatchObject({
      ok: true,
    });
    expect(proc.cancelled).toBe(1);
  });

  it("when the story's merge starts, before its worktree can go", async () => {
    const proc = await previewed("STORY-13", "STORY-13-spawn-13");
    // The merge itself is refused here (the story isn't ready), but its ending has begun: the server is stopped first.
    await p.w.window.ask("story.merge", { dir: p.w.dir, id: "STORY-13" });
    expect(proc.cancelled).toBe(1);
  });

  it("when the project closes", async () => {
    const proc = await previewed("STORY-6", "STORY-6-spawn-six");
    p.w.allowed.set([]);
    try {
      expect(proc.cancelled).toBe(1);
    } finally {
      p.w.allowed.set([p.w.dir]);
    }
  });
});
