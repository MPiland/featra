export type KeyInput = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/** Ctrl+B (Cmd+B on macOS). Matches on the physical key too, so it works on non-Latin keyboard layouts. */
export function isToggleSidebarShortcut(e: KeyInput, platform: string): boolean {
  const mod = platform === "darwin" ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  const isB = e.key.toLowerCase() === "b" || e.code === "KeyB";
  return mod && isB && !e.altKey && !e.shiftKey;
}

export function toggleSidebarShortcutLabel(platform: string): string {
  return platform === "darwin" ? "⌘B" : "Ctrl+B";
}
