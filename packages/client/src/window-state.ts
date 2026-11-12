/** The window's size state (maximized, full screen) and the title bar's maximize button for it. */
import { isRecord } from "@featra/work-format/guards";

/** Whether the window is maximized or full screen, as the OS has it. Main reports every change, whoever made it. */
export interface WindowState {
  maximized: boolean;
  fullScreen: boolean;
}

export const DEFAULT_WINDOW_STATE: WindowState = { maximized: false, fullScreen: false };

export function normalizeWindowState(raw: unknown): WindowState {
  const r = isRecord(raw) ? raw : {};
  return { maximized: r.maximized === true, fullScreen: r.fullScreen === true };
}

/**
 * What the title bar's maximize button does. In full screen it leaves full screen, which puts the window back to
 * the size and maximized state it had before; un-maximizing a full-screen window instead shrinks it and the OS
 * snaps it back (BUG-1).
 */
export function sizeButtonAction(state: WindowState): "leaveFullScreen" | "unmaximize" | "maximize" {
  if (state.fullScreen) return "leaveFullScreen";
  return state.maximized ? "unmaximize" : "maximize";
}

/** The maximize button's label (and tooltip) and icon for the window's state, in the platform's words. */
export function sizeButtonFor(state: WindowState, platform: string): { label: string; icon: "maximize" | "restore" } {
  if (state.fullScreen) return { label: "Exit Full Screen", icon: "restore" };
  if (state.maximized) return { label: platform === "win32" ? "Restore Down" : "Restore", icon: "restore" };
  return { label: "Maximize", icon: "maximize" };
}
