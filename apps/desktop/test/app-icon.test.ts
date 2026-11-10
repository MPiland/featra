import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/** Fakes only Electron: the window records the options it was created with, as the platform would receive them. */
const created: Record<string, unknown>[] = [];
vi.mock("electron", () => ({
  BrowserWindow: class {
    constructor(options: Record<string, unknown>) {
      created.push(options);
    }
    once() {}
    on() {}
    loadFile() {
      return Promise.resolve();
    }
    loadURL() {
      return Promise.resolve();
    }
  },
  nativeTheme: { shouldUseDarkColors: false },
}));

const { appIconPath, applyDockIcon } = await import("../src/app-icon.ts");
const { createWindow } = await import("../src/window.ts");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSize(png: Buffer): [number, number] {
  expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
  expect(png.subarray(png.length - 8, png.length - 4).toString("latin1")).toBe("IEND");
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

function icoEntries(ico: Buffer) {
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const e = 6 + i * 16;
    const size = ico[e] || 256;
    const png = ico.subarray(ico.readUInt32LE(e + 12), ico.readUInt32LE(e + 12) + ico.readUInt32LE(e + 8));
    return { size, png };
  });
}

describe("The taskbar, window and dock show Featra's icon, not Electron's", () => {
  it("creates the window with the icon path for the platform it runs on", () => {
    createWindow();
    expect(created.at(-1)?.icon).toBe(appIconPath(process.platform));
  });

  it("Windows takes the .ico, Linux the .png", () => {
    expect(appIconPath("win32")).toMatch(/assets[\\/]icon\.ico$/);
    expect(appIconPath("linux")).toMatch(/assets[\\/]icon\.png$/);
  });

  it("the Windows icon file exists and holds 16, 32, 48 and 256 px PNGs", () => {
    const file = appIconPath("win32");
    expect(existsSync(file)).toBe(true);
    const entries = icoEntries(readFileSync(file));
    expect(entries.map((e) => e.size)).toEqual([16, 32, 48, 256]);
    for (const { size, png } of entries) expect(pngSize(png)).toEqual([size, size]);
  });

  it("the Linux icon file exists and is a 512 px PNG", () => {
    const file = appIconPath("linux");
    expect(existsSync(file)).toBe(true);
    expect(pngSize(readFileSync(file))).toEqual([512, 512]);
  });

  it("macOS gets the png through the dock; other platforms leave the dock alone", () => {
    const set: string[] = [];
    applyDockIcon({ setIcon: (p) => set.push(p) }, "darwin");
    applyDockIcon({ setIcon: (p) => set.push(p) }, "win32");
    applyDockIcon(undefined, "darwin");
    expect(set).toEqual([appIconPath("linux")]);
    expect(existsSync(set[0]!)).toBe(true);
  });
});
