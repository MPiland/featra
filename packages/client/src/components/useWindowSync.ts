import { useEffect, useState } from "react";
import { DEFAULT_WINDOW_STATE, type AppSettings, type FeatraBridge, type WindowState } from "../bridge.ts";
import { applyTheme } from "../theme.ts";

/**
 * Keeps the window and the page in step: the zoom and theme go to the host, and the window's maximized and full-screen
 * state comes back from it, which reports every change, the OS's too. Returns that state.
 */
export function useWindowSync(bridge: FeatraBridge, zoomFactor: number, theme: AppSettings["theme"]): WindowState {
  const [windowState, setWindowState] = useState<WindowState>(DEFAULT_WINDOW_STATE);
  useEffect(() => bridge.window.setZoomFactor(zoomFactor), [bridge, zoomFactor]);
  useEffect(() => {
    let live = true;
    const off = bridge.window.onStateChange((s) => live && setWindowState(s));
    void bridge.window.state().then((s) => live && setWindowState(s));
    return () => {
      live = false;
      off();
    };
  }, [bridge]);
  // The theme setting (Settings > Appearance; System by default, so the OS decides).
  useEffect(() => {
    applyTheme(theme);
    bridge.window.setTheme(theme);
  }, [bridge, theme]);
  return windowState;
}
