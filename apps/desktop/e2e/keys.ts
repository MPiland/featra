import { shortcutLabel, type ShortcutId } from "@featra/client/shortcuts";
import type { Page } from "./fixtures.ts";

/** macOS's modifier symbols, in the order its menus print them, as Playwright names the keys. */
const MAC_MODIFIERS: Record<string, string> = { "⌃": "Control", "⌥": "Alt", "⇧": "Shift", "⌘": "Meta" };
/** Words in the Windows and Linux labels that Playwright names otherwise. */
const KEY_NAMES: Record<string, string> = { Ctrl: "Control", Left: "ArrowLeft", Right: "ArrowRight" };

/**
 * The keys Playwright presses for a shortcut label as the app's menu shows it: "Ctrl+Shift+W" or "⇧⌘N", say. The
 * label comes from the app's own table (`shortcutLabel`), so each platform's test presses that platform's shortcut.
 */
export function keysOf(label: string): string {
  const mods: string[] = [];
  let rest = label;
  while (rest.length > 1 && MAC_MODIFIERS[rest[0]!]) {
    mods.push(MAC_MODIFIERS[rest[0]!]!);
    rest = rest.slice(1);
  }
  const parts = mods.length > 0 ? [...mods, rest] : label.split(/\+(?=.)/);
  return parts.map((p) => KEY_NAMES[p] ?? p).join("+");
}

/** The label of shortcut `id` on the platform the tests run on. */
export function labelOf(id: ShortcutId): string {
  const label = shortcutLabel(id, process.platform);
  if (label === undefined) throw new Error(`"${id}" has no shortcut on ${process.platform}`);
  return label;
}

const mac = process.platform === "darwin";
/** Moves a text field's caret to the end of the line: End, or ⌘→ on macOS, where End only scrolls. */
export const LINE_END = mac ? "Meta+ArrowRight" : "End";
/** Selects back to the start of the line: Shift+Home, or ⇧⌘← on macOS. */
export const SELECT_TO_LINE_START = mac ? "Shift+Meta+ArrowLeft" : "Shift+Home";

/** Presses shortcut `id` as a user on this platform would: Ctrl+N on Windows and Linux, ⌘N on macOS. */
export const pressShortcut = (page: Page, id: ShortcutId) => page.keyboard.press(keysOf(labelOf(id)));
