/** System follows the OS; Light and Dark override it. */
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

/**
 * Light and Dark pin the palette with `data-theme` on <html>; System removes it so the
 * `prefers-color-scheme` rules in styles.css decide.
 */
export function applyTheme(theme: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
