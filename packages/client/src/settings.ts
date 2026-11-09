/**
 * The settings model. App settings are the user's, for every project: stored by the host in the user's config folder
 * (Electron's userData, `settings.json`). Work settings exist at both scopes: the app holds the defaults and a
 * project's `.featra/config.yaml` can override any of them. A project overrides a setting exactly when its file sets
 * the key; resetting removes the key so the app default applies again.
 */
import type { KnowledgePermission, ProgressMode, ProjectConfig } from "@featra/work-format";
import { isOneOf, isRecord } from "@featra/work-format/guards";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";

/** What the window's close button (and Alt+F4) does. */
export type CloseButton = "tray" | "quit";
export const CLOSE_BUTTON_CHOICES: readonly CloseButton[] = ["tray", "quit"];

/** Project settings that also have an app-wide default. Featra's own defaults match work-format's DEFAULT_CONFIG. */
export type WorkSettings = Pick<ProjectConfig, "progress" | "requireAccept" | "worktrees" | "mcp" | "knowledge">;
export type WorkSettingKey = keyof WorkSettings;
export type WorkOverrides = Partial<WorkSettings>;

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  progress: "stories",
  requireAccept: true,
  worktrees: true,
  mcp: true,
  knowledge: "propose",
};

export interface AppSettings {
  theme: ThemeChoice;
  closeButton: CloseButton;
  /** The defaults every project gets unless its own config overrides them. */
  work: WorkSettings;
}

export const DEFAULT_APP_SETTINGS: AppSettings = { theme: "system", closeButton: "tray", work: DEFAULT_WORK_SETTINGS };

/** One option of a choice setting. */
export interface ChoiceDef<V> {
  value: V;
  label: string;
}
export type WorkSettingDef =
  | { key: "progress"; kind: "choice"; label: string; help?: string; choices: readonly ChoiceDef<ProgressMode>[] }
  | {
      key: "knowledge";
      kind: "choice";
      label: string;
      help?: string;
      choices: readonly ChoiceDef<KnowledgePermission>[];
    }
  | { key: "requireAccept" | "worktrees" | "mcp"; kind: "toggle"; label: string; help?: string };

/** Work settings in the order Settings shows them, with their wording. */
export const WORK_SETTINGS: readonly WorkSettingDef[] = [
  {
    key: "progress",
    kind: "choice",
    label: "Feature progress",
    choices: [
      { value: "stories", label: "Stories" },
      { value: "tasks", label: "Tasks" },
    ],
  },
  { key: "requireAccept", kind: "toggle", label: "Require acceptance before Done" },
  { key: "worktrees", kind: "toggle", label: "Use a worktree per story" },
  {
    key: "mcp",
    kind: "toggle",
    label: "Featra MCP",
    help: "Lets agents log decisions and open questions. Turning it off also stops running chats.",
  },
  {
    key: "knowledge",
    kind: "choice",
    label: "Agent access to project knowledge",
    // "Project knowledge" alone doesn't say what it covers.
    help: "Glossary, decisions and ADRs.",
    choices: [
      { value: "edit", label: "Edit" },
      { value: "propose", label: "Propose edits" },
      { value: "read-only", label: "Read only" },
    ],
  },
];

export const WORK_SETTING_KEYS: readonly WorkSettingKey[] = WORK_SETTINGS.map((d) => d.key);

/** The definition of one work setting. Every key has one: WORK_SETTINGS lists them all. */
export function workSettingDef(key: WorkSettingKey): WorkSettingDef {
  const def = WORK_SETTINGS.find((d) => d.key === key);
  if (!def) throw new Error(`No work setting "${key}"`);
  return def;
}

const record = (raw: unknown): Record<string, unknown> => (isRecord(raw) ? raw : {});

function validWorkValue(key: WorkSettingKey, value: unknown): boolean {
  const def = workSettingDef(key);
  if (def.kind === "toggle") return typeof value === "boolean";
  return (def.choices as readonly ChoiceDef<unknown>[]).some((c) => c.value === value);
}

/** Only the work settings, and only valid values: anything else is not an override. */
export function normalizeWorkOverrides(raw: unknown): WorkOverrides {
  const r = record(raw);
  const out: Record<string, unknown> = {};
  for (const key of WORK_SETTING_KEYS) if (key in r && validWorkValue(key, r[key])) out[key] = r[key];
  return out;
}

/** Reads stored app settings defensively: unknown or malformed fields fall back to defaults. */
export function normalizeAppSettings(raw: unknown): AppSettings {
  const r = record(raw);
  return {
    theme: isOneOf(THEME_CHOICES, r.theme) ? r.theme : DEFAULT_APP_SETTINGS.theme,
    closeButton: isOneOf(CLOSE_BUTTON_CHOICES, r.closeButton) ? r.closeButton : DEFAULT_APP_SETTINGS.closeButton,
    work: { ...DEFAULT_WORK_SETTINGS, ...normalizeWorkOverrides(r.work) },
  };
}

/** What a project actually uses: its overrides on top of the app defaults. */
export function effectiveWork(defaults: WorkSettings, overrides: WorkOverrides): WorkSettings {
  return { ...defaults, ...overrides };
}

export const isOverridden = (overrides: WorkOverrides, key: WorkSettingKey): boolean => key in overrides;

/** The label of a setting's value, as in "App default: Stories". */
export function workValueLabel(key: WorkSettingKey, value: WorkSettings[WorkSettingKey]): string {
  const def = workSettingDef(key);
  if (def.kind === "toggle") return value ? "On" : "Off";
  return (def.choices as readonly ChoiceDef<unknown>[]).find((c) => c.value === value)?.label ?? String(value);
}

/** A project's work settings as its config file has them. */
export interface ProjectSettings {
  dir: string;
  overrides: WorkOverrides;
  /** Set when `.featra/config.yaml` can't be read; Settings shows it and changes nothing. */
  error: string | null;
}

/**
 * Whether the close button can keep Featra running. `null` where there is no window to close (a browser tab).
 * Unavailable on a Linux desktop without a tray: a hidden window could not be brought back, so close always quits.
 */
export type CloseToTraySupport =
  | null
  | { available: true; place: "tray" | "dock" }
  | { available: false; reason: string };

export interface SettingsSnapshot {
  app: AppSettings;
  closeToTray: CloseToTraySupport;
}

export const NO_TRAY_REASON = "No system tray, so closing quits.";

function normalizeCloseToTray(raw: unknown): CloseToTraySupport {
  if (raw === null || raw === undefined) return null;
  const r = record(raw);
  if (r.available === true) return { available: true, place: r.place === "dock" ? "dock" : "tray" };
  return { available: false, reason: typeof r.reason === "string" && r.reason ? r.reason : NO_TRAY_REASON };
}

export function normalizeSettingsSnapshot(raw: unknown): SettingsSnapshot {
  const r = record(raw);
  return {
    app: normalizeAppSettings(r.app),
    closeToTray: normalizeCloseToTray(r.closeToTray),
  };
}

export function normalizeProjectSettings(raw: unknown, dir: string): ProjectSettings {
  const r = record(raw);
  return {
    dir,
    overrides: normalizeWorkOverrides(r.overrides),
    error: typeof r.error === "string" && r.error ? r.error : null,
  };
}
