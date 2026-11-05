import type { EditCommand } from "./bridge.ts";

export type KeyInput = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/** Shortcuts the app handles itself. Edit shortcuts are left to the browser engine, which already does them. */
export type AppShortcut = "toggleSidebar" | "settings" | "zoomIn" | "zoomOut" | "zoomReset" | "quit";
export type ShortcutId = AppShortcut | EditCommand;

const isMac = (platform: string) => platform === "darwin";

/** Ctrl on Windows and Linux, Cmd on macOS — and not the other one. */
function primary(e: KeyInput, platform: string): boolean {
  return isMac(platform) ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** Ctrl+B (Cmd+B on macOS). Matches on the physical key too, so it works on non-Latin keyboard layouts. */
export function isToggleSidebarShortcut(e: KeyInput, platform: string): boolean {
  const isB = e.key.toLowerCase() === "b" || e.code === "KeyB";
  return primary(e, platform) && isB && !e.altKey && !e.shiftKey;
}

export function matchShortcut(e: KeyInput, platform: string): AppShortcut | null {
  if (!primary(e, platform) || e.altKey) return null;
  if (isToggleSidebarShortcut(e, platform)) return "toggleSidebar";
  // "+" is Shift+= on most layouts, so Shift is allowed for zoom in.
  if (e.key === "=" || e.key === "+" || e.code === "NumpadAdd") return "zoomIn";
  if (e.shiftKey) return null;
  if (e.key === "-" || e.code === "NumpadSubtract") return "zoomOut";
  if (e.key === "0" || e.code === "Numpad0") return "zoomReset";
  if (e.key === ",") return "settings";
  // macOS quits through its app menu (Cmd+Q) and Windows through Alt+F4; Linux needs Ctrl+Q from us.
  if (platform === "linux" && (e.key.toLowerCase() === "q" || e.code === "KeyQ")) return "quit";
  return null;
}

const LABELS: Record<ShortcutId, [pc: string, mac: string]> = {
  toggleSidebar: ["Ctrl+B", "⌘B"],
  settings: ["Ctrl+,", "⌘,"],
  zoomIn: ["Ctrl+=", "⌘="],
  zoomOut: ["Ctrl+-", "⌘-"],
  zoomReset: ["Ctrl+0", "⌘0"],
  quit: ["Ctrl+Q", "⌘Q"],
  undo: ["Ctrl+Z", "⌘Z"],
  redo: ["Ctrl+Y", "⇧⌘Z"],
  cut: ["Ctrl+X", "⌘X"],
  copy: ["Ctrl+C", "⌘C"],
  paste: ["Ctrl+V", "⌘V"],
  selectAll: ["Ctrl+A", "⌘A"],
};

export function shortcutLabel(id: ShortcutId, platform: string): string {
  if (id === "quit" && platform === "win32") return "Alt+F4";
  if (id === "redo" && platform === "linux") return "Ctrl+Shift+Z";
  return LABELS[id][isMac(platform) ? 1 : 0];
}

export function toggleSidebarShortcutLabel(platform: string): string {
  return shortcutLabel("toggleSidebar", platform);
}
