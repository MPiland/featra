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

const ctrl = (k: string, code = "", over: Partial<KeyInput> = {}) => key({ key: k, code, ctrlKey: true, ...over });
const cmd = (k: string, code = "", over: Partial<KeyInput> = {}) => key({ key: k, code, metaKey: true, ...over });

describe("app shortcuts", () => {
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

  it("matches Close Window, Full Screen, Reload, Back and Forward on Windows and Linux", () => {
    for (const platform of ["win32", "linux", "web"]) {
      expect(matchShortcut(ctrl("W", "KeyW", { shiftKey: true }), platform)).toBe("closeWindow");
      expect(matchShortcut(key({ key: "F11", code: "F11" }), platform)).toBe("fullScreen");
      expect(matchShortcut(key({ key: "F5", code: "F5" }), platform)).toBe("reload");
      expect(matchShortcut(key({ key: "ArrowLeft", code: "ArrowLeft", altKey: true }), platform)).toBe("back");
      expect(matchShortcut(key({ key: "ArrowRight", code: "ArrowRight", altKey: true }), platform)).toBe("forward");
      expect(matchShortcut(ctrl("w", "KeyW"), platform)).toBeNull(); // Ctrl+W alone is too easy to hit
      expect(matchShortcut(key({ key: "ArrowLeft", code: "ArrowLeft" }), platform)).toBeNull();
      expect(matchShortcut(key({ key: "F5", code: "F5", ctrlKey: true }), platform)).toBeNull();
    }
  });

  it("matches the macOS equivalents: Cmd+W, Ctrl+Cmd+F, Cmd+R, Cmd+[ and Cmd+]", () => {
    expect(matchShortcut(cmd("w", "KeyW"), "darwin")).toBe("closeWindow");
    expect(matchShortcut(key({ key: "f", code: "KeyF", ctrlKey: true, metaKey: true }), "darwin")).toBe("fullScreen");
    expect(matchShortcut(cmd("r", "KeyR"), "darwin")).toBe("reload");
    expect(matchShortcut(cmd("[", "BracketLeft"), "darwin")).toBe("back");
    expect(matchShortcut(cmd("]", "BracketRight"), "darwin")).toBe("forward");
    expect(matchShortcut(key({ key: "F11", code: "F11" }), "darwin")).toBeNull();
  });

  it("binds no Quit shortcut: Exit has none on Windows and Linux, and macOS's Cmd+Q is its app menu's", () => {
    for (const platform of ["win32", "linux", "web"]) {
      expect(matchShortcut(ctrl("q", "KeyQ"), platform)).toBeNull();
      expect(matchShortcut(ctrl("й", "KeyQ"), platform)).toBeNull();
    }
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
    expect(shortcutLabel("quit", "win32")).toBeUndefined(); // Exit has no shortcut; Alt+F4 closes to the tray
    expect(shortcutLabel("quit", "linux")).toBeUndefined();
    expect(shortcutLabel("quit", "darwin")).toBe("⌘Q");
    expect(shortcutLabel("closeWindow", "win32")).toBe("Ctrl+Shift+W");
    expect(shortcutLabel("closeWindow", "darwin")).toBe("⌘W");
    expect(shortcutLabel("fullScreen", "win32")).toBe("F11");
    expect(shortcutLabel("fullScreen", "darwin")).toBe("⌃⌘F");
    expect(shortcutLabel("reload", "win32")).toBe("F5");
    expect(shortcutLabel("back", "win32")).toBe("Alt+Left");
    expect(shortcutLabel("forward", "darwin")).toBe("⌘]");
    expect(shortcutLabel("redo", "win32")).toBe("Ctrl+Y");
    expect(shortcutLabel("redo", "linux")).toBe("Ctrl+Shift+Z");
    expect(shortcutLabel("redo", "darwin")).toBe("⇧⌘Z");
  });
});

describe("STORY-19 AC4: project shortcuts", () => {
  it("New Project… is Ctrl+Shift+N, Open Folder… Ctrl+O and Project Settings… Ctrl+Shift+, on Windows and Linux", () => {
    for (const platform of ["win32", "linux"]) {
      expect(matchShortcut(ctrl("N", "KeyN", { shiftKey: true }), platform)).toBe("newProject");
      expect(matchShortcut(ctrl("o", "KeyO"), platform)).toBe("openFolder");
      expect(matchShortcut(ctrl("<", "Comma", { shiftKey: true }), platform)).toBe("projectSettings");
      // Shift turns "," into "<" on most layouts: the physical key or either character will do.
      expect(matchShortcut(ctrl("<", "", { shiftKey: true }), platform)).toBe("projectSettings");
      expect(matchShortcut(ctrl(",", "", { shiftKey: true }), platform)).toBe("projectSettings");
      expect(matchShortcut(ctrl(",", "Comma"), platform)).toBe("settings");
    }
  });

  it("keeps Ctrl+N for New chat and leaves Ctrl+Shift+O and Ctrl+Alt+O alone", () => {
    expect(matchShortcut(ctrl("n", "KeyN"), "win32")).toBeNull();
    expect(matchShortcut(ctrl("O", "KeyO", { shiftKey: true }), "win32")).toBeNull();
    expect(matchShortcut(ctrl("o", "KeyO", { altKey: true }), "win32")).toBeNull();
  });

  it("works on non-Latin layouts by the physical key", () => {
    expect(matchShortcut(ctrl("щ", "KeyO"), "win32")).toBe("openFolder");
    expect(matchShortcut(ctrl("Т", "KeyN", { shiftKey: true }), "win32")).toBe("newProject");
  });

  it("uses Cmd on macOS: ⇧⌘N, ⌘O and ⇧⌘,", () => {
    expect(matchShortcut(cmd("n", "KeyN", { shiftKey: true }), "darwin")).toBe("newProject");
    expect(matchShortcut(cmd("o", "KeyO"), "darwin")).toBe("openFolder");
    expect(matchShortcut(cmd("<", "Comma", { shiftKey: true }), "darwin")).toBe("projectSettings");
    expect(matchShortcut(ctrl("o", "KeyO"), "darwin")).toBeNull();
    expect(shortcutLabel("newProject", "darwin")).toBe("⇧⌘N");
    expect(shortcutLabel("openFolder", "darwin")).toBe("⌘O");
    expect(shortcutLabel("projectSettings", "darwin")).toBe("⇧⌘,");
    expect(shortcutLabel("newProject", "linux")).toBe("Ctrl+Shift+N");
    expect(shortcutLabel("openFolder", "win32")).toBe("Ctrl+O");
    expect(shortcutLabel("projectSettings", "win32")).toBe("Ctrl+Shift+,");
  });
});
