import { useEffect } from "react";
import type { MenuActions } from "../menu.ts";
import { matchShortcut, type AppShortcut } from "../shortcuts.ts";

/**
 * Shortcuts a plain browser tab keeps for itself: it has no window to close and no folders to open, so no chats to
 * start either.
 */
const WEB_KEEPS: ReadonlySet<AppShortcut> = new Set([
  "fullScreen",
  "closeWindow",
  "newChat",
  "newProject",
  "openFolder",
]);

/** Every shortcut the menu shows also works from the keyboard: one keydown listener runs the menu's own actions. */
export function useShortcuts(platform: string, actions: MenuActions) {
  useEffect(() => {
    const run: Record<AppShortcut, () => void> = {
      newChat: actions.newChat,
      settings: actions.openSettings,
      keyboardShortcuts: actions.showKeyboardShortcuts,
      newProject: actions.newProject,
      openFolder: actions.openFolder,
      projectSettings: actions.projectSettings,
      closeWindow: actions.closeWindow,
      toggleSidebar: actions.toggleSidebar,
      zoomReset: actions.zoomReset,
      zoomIn: actions.zoomIn,
      zoomOut: actions.zoomOut,
      fullScreen: actions.toggleFullScreen,
      reload: actions.reload,
      back: actions.back,
      forward: actions.forward,
    };
    const onKey = (e: KeyboardEvent) => {
      const shortcut = matchShortcut(e, platform);
      if (!shortcut) return;
      if (platform === "web" && WEB_KEEPS.has(shortcut)) return;
      e.preventDefault();
      run[shortcut]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [platform, actions]);
}
