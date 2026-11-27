/**
 * STORY-74: a feature's preview checkout when the app quits (host-gone.ts) with its Browser pane open. The dev servers
 * stop first, then the pane lets go of its server and removes the checkout once that server's process has ended; one
 * still running after a short wait is left for the sweep at the project's next open. The real services and git; only
 * the dev server's process, port probe and HTTP answer are faked (proof-world.ts).
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { basename } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { whenHostGone } from "../src/host-gone.ts";
import { platform, proofWorld } from "./proof-world.ts";

afterEach(() => {
  platform.lingers = false;
  for (const exit of platform.exits.splice(0)) exit();
});

/** A world with FEAT-2 open in a Browser pane; its dev server's process. */
async function featureOpen() {
  const p = await proofWorld();
  const before = platform.procs.length;
  const started = await p.w.window.ask("browser.start", { dir: p.w.dir, id: "FEAT-2", pane: "load-q:1" });
  expect(started).toMatchObject({ ok: true });
  const proc = platform.procs[before]!;
  expect(basename(proc.cwd)).toMatch(/^featra-feature-preview-/);
  return { p, proc };
}

/** The app quits: the host goes. */
async function quit(p: Awaited<ReturnType<typeof proofWorld>>) {
  let exited = 0;
  const capture = { close: () => {} };
  await whenHostGone({ capture, devServers: p.w.services.devServers, close: () => p.w.close(), exit: () => exited++ });
  expect(exited).toBe(1);
}

describe("A feature's preview checkout when the app quits", () => {
  // Regression (STORY-74 review): the dev servers were stopped first, so the pane's close found no server it launched
  // and never removed its checkout: each quit left one behind.
  it("is removed once its dev server has ended", async () => {
    const { p, proc } = await featureOpen();
    await quit(p);
    expect(proc.cancelled).toBe(1);
    expect(proc.ended).toBe(true);
    expect(existsSync(proc.cwd)).toBe(false);
  });

  it("is left for the next open's sweep while its dev server is still running", async () => {
    const { p, proc } = await featureOpen();
    platform.lingers = true;
    await quit(p);
    expect(proc.cancelled).toBe(1);
    expect(proc.ended).toBe(false);
    // Nothing is removed under a process still running in it.
    expect(existsSync(proc.cwd)).toBe(true);
    await rm(proc.cwd, { recursive: true, force: true });
  });
});
