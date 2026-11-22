import { describe, expect, it } from "vitest";
import { overlayBitmap } from "../src/badge-image.ts";
import { createBadge, type Overlay } from "../src/badge.ts";

/**
 * STORY-67: the badge's calls on each OS, over the real badge rules and overlay drawing. Only the OS calls are fake:
 * each records what it was given.
 */
function os(platform: NodeJS.Platform, opts: { launcher?: boolean; dock?: boolean } = {}) {
  const calls: unknown[] = [];
  const logs: string[] = [];
  const badge = createBadge({
    platform,
    dock: opts.dock === false ? undefined : { setBadge: (text) => void calls.push(["dock", text]) },
    setBadgeCount(count) {
      calls.push(["launcher", count]);
      return opts.launcher ?? true;
    },
    setOverlay: (overlay: Overlay | null, description) => void calls.push(["overlay", overlay, description]),
    log: (m) => logs.push(m),
  });
  return { badge, calls, logs };
}

const overlay = (label: string) => ({ label, bitmap: overlayBitmap(label) });

describe("AC1: the Dock icon and the taskbar button show the number of waiting agents", () => {
  it("puts the number on the Dock icon on macOS, however large", () => {
    const { badge, calls } = os("darwin");
    badge.show(2);
    badge.show(12);
    expect(calls).toEqual([
      ["dock", "2"],
      ["dock", "12"],
    ]);
  });

  it("draws the number over the taskbar button on Windows, with what a screen reader hears", () => {
    const { badge, calls } = os("win32");
    badge.show(1);
    badge.show(3);
    expect(calls).toEqual([
      ["overlay", overlay("1"), "1 agent waiting"],
      ["overlay", overlay("3"), "3 agents waiting"],
    ]);
  });

  it("draws 9+ past nine on Windows, and says the whole number", () => {
    const { badge, calls } = os("win32");
    badge.show(10);
    badge.show(23);
    expect(calls).toEqual([
      ["overlay", overlay("9+"), "10 agents waiting"],
      ["overlay", overlay("9+"), "23 agents waiting"],
    ]);
  });

  it("makes no other OS's call", () => {
    for (const platform of ["darwin", "win32"] as const) {
      const { badge, calls } = os(platform);
      badge.show(2);
      expect(calls.map((c) => (c as string[])[0])).toEqual([platform === "darwin" ? "dock" : "overlay"]);
    }
  });

  it("does nothing on macOS without a Dock", () => {
    const { badge, calls } = os("darwin", { dock: false });
    badge.show(2);
    expect(calls).toEqual([]);
  });
});

describe("AC2: on Linux, desktops that support a count show it", () => {
  it("sets the launcher's count", () => {
    const { badge, calls, logs } = os("linux");
    badge.show(2);
    badge.show(5);
    expect(calls).toEqual([
      ["launcher", 2],
      ["launcher", 5],
    ]);
    expect(logs).toEqual([]);
  });

  it("keeps setting it on a desktop with none, and logs that once", () => {
    const { badge, calls, logs } = os("linux", { launcher: false });
    badge.show(2);
    badge.show(3);
    badge.show(0);
    badge.show(1);
    expect(calls).toEqual([
      ["launcher", 2],
      ["launcher", 3],
      ["launcher", 0],
      ["launcher", 1],
    ]);
    expect(logs).toEqual(["This desktop shows no count on the app's icon"]);
  });
});

describe("AC3: the badge clears when no agent is waiting, and updates live", () => {
  it("clears the Dock badge, the overlay and the launcher count at 0", () => {
    const mac = os("darwin");
    const win = os("win32");
    const linux = os("linux");
    for (const { badge } of [mac, win, linux]) {
      badge.show(2);
      badge.show(0);
    }
    expect(mac.calls.at(-1)).toEqual(["dock", ""]);
    expect(win.calls.at(-1)).toEqual(["overlay", null, ""]);
    expect(linux.calls.at(-1)).toEqual(["launcher", 0]);
  });

  it("calls the OS only when the count changes, and not at all for 0 at the start", () => {
    const { badge, calls } = os("darwin");
    badge.show(0);
    badge.show(2);
    badge.show(2);
    badge.show(1);
    expect(calls).toEqual([
      ["dock", "2"],
      ["dock", "1"],
    ]);
  });

  it("puts the overlay back on a window shown again, and nothing when none is waiting", () => {
    const { badge, calls } = os("win32");
    badge.refresh();
    expect(calls).toEqual([]);
    badge.show(2);
    badge.refresh();
    expect(calls).toEqual([
      ["overlay", overlay("2"), "2 agents waiting"],
      ["overlay", overlay("2"), "2 agents waiting"],
    ]);
  });

  it("takes a count that isn't a whole number above 0 as none", () => {
    const { badge, calls } = os("darwin");
    badge.show(2);
    badge.show(Number.NaN);
    badge.show(3);
    badge.show(-1);
    badge.show(2);
    badge.show(1.5);
    expect(calls).toEqual([
      ["dock", "2"],
      ["dock", ""],
      ["dock", "3"],
      ["dock", ""],
      ["dock", "2"],
      ["dock", ""],
    ]);
  });
});
