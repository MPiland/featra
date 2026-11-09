/**
 * What Settings shows, as plain data: its pages and their order, how work settings group, and the wording of choices
 * and overrides. The components in `components/settings/` render it.
 */
import type { ChoiceDef, CloseButton, CloseToTraySupport, SettingsSnapshot, WorkSettingKey } from "./settings.ts";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";

/** Settings' pages. App pages hold the user's own settings; the Project page holds one project's overrides. */
export type SettingsPage = "general" | "appearance" | "workDefaults" | "shortcuts" | "project" | "roles";
export type SettingsScope = "app" | "project";

export interface PageDef {
  id: SettingsPage;
  title: string;
  scope: SettingsScope;
}

export const SCOPE_TITLES: Record<SettingsScope, string> = { app: "App", project: "Project" };

/** The work settings page: the same name at both scopes, and not a section heading inside it. */
const WORK_PAGE_TITLE = "Workflow";

const PAGES: readonly PageDef[] = [
  { id: "general", title: "General", scope: "app" },
  { id: "appearance", title: "Appearance", scope: "app" },
  { id: "workDefaults", title: WORK_PAGE_TITLE, scope: "app" },
  { id: "shortcuts", title: "Keyboard shortcuts", scope: "app" },
  { id: "project", title: WORK_PAGE_TITLE, scope: "project" },
  { id: "roles", title: "Roles", scope: "project" },
];

/** General holds only the close button, which a browser tab doesn't have: there the page is left out. */
export function settingsPages(snapshot: SettingsSnapshot): readonly PageDef[] {
  return PAGES.filter((p) => p.id !== "general" || snapshot.closeToTray !== null);
}

export function firstSettingsPage(snapshot: SettingsSnapshot): SettingsPage {
  return settingsPages(snapshot)[0]?.id ?? "appearance";
}

/** Work settings, in titled groups. Both Workflow pages show them so. */
export const WORK_GROUPS: readonly { title: string; keys: readonly WorkSettingKey[] }[] = [
  { title: "Progress and review", keys: ["progress", "requireAccept"] },
  { title: "Agents", keys: ["worktrees", "mcp", "knowledge"] },
];

const THEME_LABELS: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" };
export const THEME_OPTIONS: readonly ChoiceDef<ThemeChoice>[] = THEME_CHOICES.map((t) => ({
  value: t,
  label: THEME_LABELS[t],
}));

/** The close button's choices: macOS keeps a closed app in the Dock, other desktops in the tray. */
export function closeButtonOptions(support: NonNullable<CloseToTraySupport>): readonly ChoiceDef<CloseButton>[] {
  const place = support.available && support.place === "dock" ? "Dock" : "tray";
  return [
    { value: "tray", label: `Minimize to ${place}` },
    { value: "quit", label: "Quit" },
  ];
}

/** The wording of a project override: the app default it replaces, and its Reset button's name. */
export const appDefaultText = (defaultLabel: string) => `App default: ${defaultLabel}`;
export const resetLabel = (settingLabel: string) => `Reset ${settingLabel} to the app default`;
