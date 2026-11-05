import { describe, expect, it } from "vitest";
import { isToggleSidebarShortcut, type KeyInput } from "../src/shortcuts.ts";

const key = (over: Partial<KeyInput>): KeyInput => ({
  key: "b",
  code: "KeyB",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
});

describe("toggle sidebar shortcut", () => {
  it("is Ctrl+B on Windows and Linux", () => {
    for (const platform of ["win32", "linux", "web"]) {
      expect(isToggleSidebarShortcut(key({ ctrlKey: true }), platform)).toBe(true);
      expect(isToggleSidebarShortcut(key({ metaKey: true }), platform)).toBe(false);
    }
  });

  it("is Cmd+B on macOS", () => {
    expect(isToggleSidebarShortcut(key({ metaKey: true }), "darwin")).toBe(true);
    expect(isToggleSidebarShortcut(key({ ctrlKey: true }), "darwin")).toBe(false);
  });

  it("works with Caps Lock and non-Latin layouts", () => {
    expect(isToggleSidebarShortcut(key({ key: "B", ctrlKey: true }), "win32")).toBe(true);
    expect(isToggleSidebarShortcut(key({ key: "и", ctrlKey: true }), "win32")).toBe(true);
  });

  it("ignores B alone and B with Shift or Alt", () => {
    expect(isToggleSidebarShortcut(key({}), "win32")).toBe(false);
    expect(isToggleSidebarShortcut(key({ ctrlKey: true, shiftKey: true }), "win32")).toBe(false);
    expect(isToggleSidebarShortcut(key({ ctrlKey: true, altKey: true }), "win32")).toBe(false);
    expect(isToggleSidebarShortcut(key({ key: "n", code: "KeyN", ctrlKey: true }), "win32")).toBe(false);
  });
});
