import type { ThemeChoice } from "./bridge.ts";

/**
 * Light and Dark pin the palette with `data-theme` on <html>; System removes it so the
 * `prefers-color-scheme` rules in styles.css decide.
 */
export function applyTheme(theme: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
