import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { takeInstanceLock } from "../src/instance-lock.ts";

/**
 * STORY-64: one Featra runs at a time, installed or from source; a second launch of either brings the running one
 * forward. Electron's single-instance lock is taken in the userData folder current when it is asked for, and the two
 * keep their own folders (decisions.md, 2026-11-18). Faked: Electron's app, which records where the lock was asked for.
 */
const APP_DATA = join("/home", "me", ".config");

function electronApp(userData: string, held: Set<string>) {
  const paths = new Map([
    ["appData", APP_DATA],
    ["userData", userData],
  ]);
  let lockedIn: string | undefined;
  return {
    getPath: (name: "appData" | "userData") => paths.get(name)!,
    setPath: (name: string, path: string) => void paths.set(name, path),
    requestSingleInstanceLock() {
      lockedIn = paths.get("userData")!;
      if (held.has(lockedIn)) return false;
      held.add(lockedIn);
      return true;
    },
    lockedIn: () => lockedIn,
  };
}

describe("the single-instance lock (STORY-64)", () => {
  it("is one lock for the installed app and a source run, each keeping its own data folder", () => {
    const held = new Set<string>();
    const installed = electronApp(join(APP_DATA, "Featra"), held);
    const source = electronApp(join(APP_DATA, "@featra", "desktop"), held);
    expect(takeInstanceLock(installed)).toBe(true);
    expect(takeInstanceLock(source)).toBe(false);
    expect(source.lockedIn()).toBe(installed.lockedIn());
    expect(installed.getPath("userData")).toBe(join(APP_DATA, "Featra"));
    expect(source.getPath("userData")).toBe(join(APP_DATA, "@featra", "desktop"));
  });

  it("holds either way round: a source run first keeps the installed app from starting", () => {
    const held = new Set<string>();
    expect(takeInstanceLock(electronApp(join(APP_DATA, "@featra", "desktop"), held))).toBe(true);
    expect(takeInstanceLock(electronApp(join(APP_DATA, "Featra"), held))).toBe(false);
  });

  it("is the profile's own when one is named, as tests and a second profile do", () => {
    const held = new Set<string>();
    const first = electronApp("/tmp/profile-a", held);
    expect(takeInstanceLock(first, "/tmp/profile-a")).toBe(true);
    expect(first.lockedIn()).toBe("/tmp/profile-a");
    expect(takeInstanceLock(electronApp("/tmp/profile-b", held), "/tmp/profile-b")).toBe(true);
    expect(takeInstanceLock(electronApp("/tmp/profile-a", held), "/tmp/profile-a")).toBe(false);
  });
});
