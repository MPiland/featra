import { describe, expect, it } from "vitest";
import { isToggleSidebarShortcut, matchShortcut, shortcutLabel, type KeyInput } from "../src/shortcuts.ts";

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

describe("app shortcuts", () => {
  const ctrl = (k: string, code = "", over: Partial<KeyInput> = {}) => key({ key: k, code, ctrlKey: true, ...over });
  const cmd = (k: string, code = "", over: Partial<KeyInput> = {}) => key({ key: k, code, metaKey: true, ...over });

  it("matches zoom, settings and sidebar with Ctrl on Windows and Linux", () => {
    for (const platform of ["win32", "linux"]) {
      expect(matchShortcut(ctrl("b", "KeyB"), platform)).toBe("toggleSidebar");
      expect(matchShortcut(ctrl("=", "Equal"), platform)).toBe("zoomIn");
      expect(matchShortcut(ctrl("+", "Equal", { shiftKey: true }), platform)).toBe("zoomIn");
      expect(matchShortcut(ctrl("+", "NumpadAdd"), platform)).toBe("zoomIn");
      expect(matchShortcut(ctrl("-", "Minus"), platform)).toBe("zoomOut");
      expect(matchShortcut(ctrl("-", "NumpadSubtract"), platform)).toBe("zoomOut");
      expect(matchShortcut(ctrl("0", "Digit0"), platform)).toBe("zoomReset");
      expect(matchShortcut(ctrl(",", "Comma"), platform)).toBe("settings");
      expect(matchShortcut(cmd("=", "Equal"), platform)).toBeNull();
    }
  });

  it("matches the same with Cmd on macOS, not Ctrl", () => {
    expect(matchShortcut(cmd("=", "Equal"), "darwin")).toBe("zoomIn");
    expect(matchShortcut(cmd(",", "Comma"), "darwin")).toBe("settings");
    expect(matchShortcut(ctrl("=", "Equal"), "darwin")).toBeNull();
  });

  it("quits with Ctrl+Q on Windows and Linux; macOS quits through its app menu (Cmd+Q)", () => {
    expect(matchShortcut(ctrl("q", "KeyQ"), "linux")).toBe("quit");
    expect(matchShortcut(ctrl("q", "KeyQ"), "win32")).toBe("quit");
    expect(matchShortcut(ctrl("й", "KeyQ"), "win32")).toBe("quit"); // physical key on other layouts
    expect(matchShortcut(cmd("q", "KeyQ"), "darwin")).toBeNull();
  });

  it("leaves edit shortcuts and Alt or Shift chords to the browser", () => {
    for (const k of ["c", "v", "x", "z", "y", "a"]) expect(matchShortcut(ctrl(k), "win32")).toBeNull();
    expect(matchShortcut(ctrl("-", "Minus", { shiftKey: true }), "win32")).toBeNull();
    expect(matchShortcut(ctrl("0", "Digit0", { altKey: true }), "win32")).toBeNull();
    expect(matchShortcut(key({ key: "=" }), "win32")).toBeNull();
  });

  it("labels shortcuts for the platform", () => {
    expect(shortcutLabel("zoomIn", "win32")).toBe("Ctrl+=");
    expect(shortcutLabel("zoomIn", "darwin")).toBe("⌘=");
    expect(shortcutLabel("quit", "win32")).toBe("Ctrl+Q"); // Alt+F4 closes to the tray, it does not quit
    expect(shortcutLabel("quit", "linux")).toBe("Ctrl+Q");
    expect(shortcutLabel("quit", "darwin")).toBe("⌘Q");
    expect(shortcutLabel("redo", "win32")).toBe("Ctrl+Y");
    expect(shortcutLabel("redo", "linux")).toBe("Ctrl+Shift+Z");
    expect(shortcutLabel("redo", "darwin")).toBe("⇧⌘Z");
  });
});
