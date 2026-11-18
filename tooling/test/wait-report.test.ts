import { describe, expect, it } from "vitest";
import { endWaits, forgetWaits, openWaits, until, waitingFor } from "../waits.ts";
import { run } from "./run.ts";

/**
 * BUG-30: a unit test the hang guard stops says what it was waiting for. The run below is real vitest on the real
 * setup file and helpers, with a 1.5 s hang guard, over tests that never finish (`hang-fixture/stuck.hang.ts`).
 */
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("VITEST") && name !== "FEATRA_HANG_GUARD_MS"),
);

function hungRun(): Record<string, string> {
  const result = run("pnpm exec vitest run --config tooling/test/hang-fixture/vitest.config.ts", {
    env: { ...env, FEATRA_HANG_GUARD_MS: "1500", NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  expect(result.status).toBe(1);
  const out = result.output.replace(new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, "g"), "");
  expect(out).toMatch(/Tests\s+3 failed \| 1 passed \(4\)/);
  const blocks: Record<string, string> = {};
  for (const block of out.split(/FAIL\s+stuck\.hang\.ts > /).slice(1)) {
    const name = block.split("\n")[0]!.trim();
    blocks[name] = (blocks[name] ?? "") + block;
  }
  return blocks;
}

describe("a unit test stopped by the hang guard says what it was waiting for (BUG-30)", () => {
  it("names the wait it was stopped in, how long it waited and the test line that asked", () => {
    const blocks = hungRun();
    expect(blocks["hangs in until"]).toContain("Test timed out in 1500ms");
    expect(blocks["hangs in until"]).toMatch(
      /The test ended while still waiting for:\n- until \(\) => ready\.done \(for \d+ s\)\n {4}at tooling\/test\/hang-fixture\/stuck\.hang\.ts:\d+: await until\(\(\) => ready\.done\);/,
    );
    expect(blocks["hangs in expect.poll"]).toContain("Test timed out in 1500ms");
    expect(blocks["hangs in expect.poll"]).toMatch(
      /- expect\.poll\(\(\) => ready\.done\)\.toBe\(true\) \(for \d+ s\)\n {4}at tooling\/test\/hang-fixture\/stuck\.hang\.ts:\d+: await expect\.poll\(\(\) => ready\.done\)\.toBe\(true\);/,
    );
    expect(blocks["fails without waiting"]).toContain("expected false to be true");
    expect(blocks["fails without waiting"]).not.toContain("still waiting");
  });

  it("notes an until while it waits, at the line that asked, and drops it once the condition holds", async () => {
    const state = { done: false };
    const waiting = until(() => state.done);
    expect(openWaits()).toMatch(
      /^The test ended while still waiting for:\n- until \(\) => state\.done \(for 0 s\)\n {4}at tooling\/test\/wait-report\.test\.ts:\d+: const waiting = until\(\(\) => state\.done\);$/,
    );
    state.done = true;
    await waiting;
    expect(openWaits()).toBeUndefined();
  });

  it("stops an until the failed test left running, saying which", async () => {
    const left = until(() => false);
    endWaits();
    await expect(left).rejects.toThrow("The test ended while waiting until () => false");
    expect(openWaits()).toBeUndefined();
  });

  it("notes any wait until it settles, and forgets without stopping one a passing test left", async () => {
    let answer: (() => void) | undefined;
    const wait = waitingFor("the reply", new Promise<void>((resolve) => (answer = resolve)));
    expect(openWaits()).toContain("- the reply (for 0 s)");
    forgetWaits();
    expect(openWaits()).toBeUndefined();
    answer?.();
    await wait;
  });
});
