import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLog, MAX_LOG_BYTES } from "../src/log.ts";

/** Runs the real log against a temporary folder and a fixed clock. */
let dir: string;
beforeEach(async () => {
  dir = join(await mkdtemp(join(tmpdir(), "featra-log-")), "logs");
});
afterEach(async () => {
  await rm(join(dir, ".."), { recursive: true, force: true });
});
const clock = () => new Date("2026-11-05T12:00:00.000Z");

describe("AC5: Show Logs has a real log to open", () => {
  it("writes timestamped lines to logs/main.log, creating the folder", async () => {
    const log = createLog(dir, clock);
    expect(log.file).toBe(join(dir, "main.log"));
    log.info("Featra 0.0.0 started (win32)");
    log.info("Window hidden");
    await log.flush();
    expect(await readFile(log.file, "utf8")).toBe(
      "2026-11-05T12:00:00.000Z Featra 0.0.0 started (win32)\n2026-11-05T12:00:00.000Z Window hidden\n",
    );
  });

  it("appends across restarts", async () => {
    const first = createLog(dir, clock);
    first.info("one");
    await first.flush();
    const second = createLog(dir, clock);
    second.info("two");
    await second.flush();
    expect((await readFile(second.file, "utf8")).split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("moves an oversized log aside on start, so it never grows without bound", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "main.log"), "x".repeat(MAX_LOG_BYTES + 1));
    const log = createLog(dir, clock);
    log.info("fresh");
    await log.flush();
    expect(await readFile(log.file, "utf8")).toBe("2026-11-05T12:00:00.000Z fresh\n");
    expect((await readFile(join(dir, "main.old.log"), "utf8")).length).toBe(MAX_LOG_BYTES + 1);
  });

  it("never throws when the folder can't be written", async () => {
    await mkdir(join(dir, ".."), { recursive: true });
    await writeFile(dir, "a file where the logs folder should be");
    const log = createLog(dir, clock);
    expect(() => log.info("lost")).not.toThrow();
    await expect(log.flush()).resolves.toBeUndefined();
  });
});
