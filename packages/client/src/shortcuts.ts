import type { EditCommand } from "./bridge.ts";

export type KeyInput = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/** Shortcuts the app handles itself. Edit shortcuts are left to the browser engine, which already does them. */
export type AppShortcut =
  | "settings"
  | "keyboardShortcuts"
  | "closeWindow"
  | "toggleSidebar"
  | "zoomReset"
  | "zoomIn"
  | "zoomOut"
  | "fullScreen"
  | "reload"
  | "back"
  | "forward";
/** Every shortcut the menu shows: the app's own, the edit commands, and macOS's Cmd+Q (handled by its app menu). */
export type ShortcutId = AppShortcut | Exclude<EditCommand, "delete"> | "quit";

const isMac = (platform: string) => platform === "darwin";

/** Ctrl on Windows and Linux, Cmd on macOS — and not the other one. */
function primary(e: KeyInput, platform: string): boolean {
  return isMac(platform) ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** The letter key, by character or by physical key, so shortcuts work on non-Latin keyboard layouts too. */
const letter = (e: KeyInput, l: string) => e.key.toLowerCase() === l || e.code === `Key${l.toUpperCase()}`;
const noModifiers = (e: KeyInput) => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

/** Ctrl+B (Cmd+B on macOS). */
export function isToggleSidebarShortcut(e: KeyInput, platform: string): boolean {
  return primary(e, platform) && letter(e, "b") && !e.altKey && !e.shiftKey;
}

export function matchShortcut(e: KeyInput, platform: string): AppShortcut | null {
  const mac = isMac(platform);

  if (!mac) {
    if (noModifiers(e) && e.key === "F5") return "reload";
    if (noModifiers(e) && e.key === "F11") return "fullScreen";
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.key === "ArrowLeft") return "back";
      if (e.key === "ArrowRight") return "forward";
    }
  } else if (e.ctrlKey && e.metaKey && !e.altKey && !e.shiftKey && letter(e, "f")) {
    return "fullScreen";
  }

  if (!primary(e, platform) || e.altKey) return null;
  if (isToggleSidebarShortcut(e, platform)) return "toggleSidebar";
  // "+" is Shift+= on most layouts, so Shift is allowed for zoom in.
  if (e.key === "=" || e.key === "+" || e.code === "NumpadAdd") return "zoomIn";
  // Ctrl+Shift+W on Windows and Linux (Ctrl+W alone is too easy to hit); Cmd+W on macOS.
  if (letter(e, "w") && e.shiftKey !== mac) return "closeWindow";
  if (e.shiftKey) return null;
  if (e.key === "-" || e.code === "NumpadSubtract") return "zoomOut";
  if (e.key === "0" || e.code === "Numpad0") return "zoomReset";
  if (e.key === ",") return "settings";
  if (e.key === "/" || e.code === "Slash") return "keyboardShortcuts";
  if (mac && (e.key === "[" || e.code === "BracketLeft")) return "back";
  if (mac && (e.key === "]" || e.code === "BracketRight")) return "forward";
  if (mac && letter(e, "r")) return "reload";
  return null;
}

const LABELS: Record<Exclude<ShortcutId, "quit">, [pc: string, mac: string]> = {
  settings: ["Ctrl+,", "⌘,"],
  keyboardShortcuts: ["Ctrl+/", "⌘/"],
  closeWindow: ["Ctrl+Shift+W", "⌘W"],
  toggleSidebar: ["Ctrl+B", "⌘B"],
  zoomReset: ["Ctrl+0", "⌘0"],
  zoomIn: ["Ctrl+=", "⌘="],
  zoomOut: ["Ctrl+-", "⌘-"],
  fullScreen: ["F11", "⌃⌘F"],
  reload: ["F5", "⌘R"],
  back: ["Alt+Left", "⌘["],
  forward: ["Alt+Right", "⌘]"],
  undo: ["Ctrl+Z", "⌘Z"],
  redo: ["Ctrl+Y", "⇧⌘Z"],
  cut: ["Ctrl+X", "⌘X"],
  copy: ["Ctrl+C", "⌘C"],
  paste: ["Ctrl+V", "⌘V"],
  selectAll: ["Ctrl+A", "⌘A"],
};

/**
 * The label the menu shows, or undefined when there is no shortcut: Exit has none on Windows and Linux (Alt+F4 is
 * close, which goes to the tray), while macOS quits with Cmd+Q.
 */
export function shortcutLabel(id: ShortcutId, platform: string): string | undefined {
  if (id === "quit") return isMac(platform) ? "⌘Q" : undefined;
  if (id === "redo" && platform === "linux") return "Ctrl+Shift+Z";
  return LABELS[id][isMac(platform) ? 1 : 0];
}

export function toggleSidebarShortcutLabel(platform: string): string {
  return shortcutLabel("toggleSidebar", platform) ?? "";
}
