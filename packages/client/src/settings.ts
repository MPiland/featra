/**
 * The settings model. App settings are the user's, for every project: stored by the host in the user's config folder
 * (Electron's userData, `settings.json`). Work settings exist at both scopes: the app holds the defaults and a
 * project's `.featra/config.yaml` can override any of them. A project overrides a setting exactly when its file sets
 * the key; resetting removes the key so the app default applies again.
 */
import type { KnowledgePermission, ProgressMode } from "@featra/work-format";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";

/** What the window's close button (and Alt+F4) does. */
export type CloseButton = "tray" | "quit";
export const CLOSE_BUTTON_CHOICES: readonly CloseButton[] = ["tray", "quit"];

/** Project settings that also have an app-wide default. Featra's own defaults match work-format's DEFAULT_CONFIG. */
export interface WorkSettings {
  progress: ProgressMode;
  requireAccept: boolean;
  worktrees: boolean;
  knowledge: KnowledgePermission;
}
export type WorkSettingKey = keyof WorkSettings;
export type WorkOverrides = Partial<WorkSettings>;

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  progress: "stories",
  requireAccept: true,
  worktrees: true,
  knowledge: "propose",
};

export interface AppSettings {
  theme: ThemeChoice;
  closeButton: CloseButton;
  /** The defaults every project gets unless its own config overrides them. */
  work: WorkSettings;
}

export const DEFAULT_APP_SETTINGS: AppSettings = { theme: "system", closeButton: "tray", work: DEFAULT_WORK_SETTINGS };

interface ChoiceDef<V> {
  value: V;
  label: string;
}
export type WorkSettingDef =
  | { key: "progress"; kind: "choice"; label: string; help: string; choices: readonly ChoiceDef<ProgressMode>[] }
  | { key: "knowledge"; kind: "choice"; label: string; help: string; choices: readonly ChoiceDef<KnowledgePermission>[] }
  | { key: "requireAccept" | "worktrees"; kind: "toggle"; label: string; help: string };

/** Work settings in the order Settings shows them, with their wording. */
export const WORK_SETTINGS: readonly WorkSettingDef[] = [
  {
    key: "progress",
    kind: "choice",
    label: "Progress counts",
    help: "What a feature's progress bar counts.",
    choices: [
      { value: "stories", label: "Stories" },
      { value: "tasks", label: "Tasks" },
    ],
  },
  {
    key: "requireAccept",
    kind: "toggle",
    label: "Stories need my Accept to be Done",
    help: "Passing checks alone don't finish a story.",
  },
  { key: "worktrees", kind: "toggle", label: "Build each story in its own worktree", help: "Off: stories run on the feature branch." },
  {
    key: "knowledge",
    kind: "choice",
    label: "Agents and project knowledge",
    help: "What agents may do with CONTEXT.md, ADRs and decisions.",
    choices: [
      { value: "edit", label: "Edit it" },
      { value: "propose", label: "Propose changes" },
      { value: "read-only", label: "Only read it" },
    ],
  },
];

export const WORK_SETTING_KEYS: readonly WorkSettingKey[] = WORK_SETTINGS.map((d) => d.key);

const record = (raw: unknown): Record<string, unknown> =>
  raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

function validWorkValue(key: WorkSettingKey, value: unknown): boolean {
  const def = WORK_SETTINGS.find((d) => d.key === key)!;
  if (def.kind === "toggle") return typeof value === "boolean";
  return (def.choices as readonly ChoiceDef<unknown>[]).some((c) => c.value === value);
}

/** Only the work settings, and only valid values: anything else is not an override. */
export function normalizeWorkOverrides(raw: unknown): WorkOverrides {
  const r = record(raw);
  const out: Record<string, unknown> = {};
  for (const key of WORK_SETTING_KEYS) if (key in r && validWorkValue(key, r[key])) out[key] = r[key];
  return out as WorkOverrides;
}

/** Reads stored app settings defensively: unknown or malformed fields fall back to defaults. */
export function normalizeAppSettings(raw: unknown): AppSettings {
  const r = record(raw);
  return {
    theme: THEME_CHOICES.includes(r.theme as ThemeChoice) ? (r.theme as ThemeChoice) : DEFAULT_APP_SETTINGS.theme,
    closeButton: CLOSE_BUTTON_CHOICES.includes(r.closeButton as CloseButton)
      ? (r.closeButton as CloseButton)
      : DEFAULT_APP_SETTINGS.closeButton,
    work: { ...DEFAULT_WORK_SETTINGS, ...normalizeWorkOverrides(r.work) },
  };
}

/** What a project actually uses: its overrides on top of the app defaults. */
export function effectiveWork(defaults: WorkSettings, overrides: WorkOverrides): WorkSettings {
  return { ...defaults, ...overrides };
}

export const isOverridden = (overrides: WorkOverrides, key: WorkSettingKey): boolean => key in overrides;

/** The label of a setting's value, for "Overrides the app default (Stories)". */
export function workValueLabel(key: WorkSettingKey, value: WorkSettings[WorkSettingKey]): string {
  const def = WORK_SETTINGS.find((d) => d.key === key)!;
  if (def.kind === "toggle") return value ? "On" : "Off";
  return (def.choices as readonly ChoiceDef<unknown>[]).find((c) => c.value === value)?.label ?? String(value);
}

export interface ProjectRef {
  /** Absolute path of the project folder (the one holding `.featra/`). */
  dir: string;
  name: string;
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
export type CloseToTraySupport = null | { available: true; place: "tray" | "dock" } | { available: false; reason: string };

export interface SettingsSnapshot {
  app: AppSettings;
  closeToTray: CloseToTraySupport;
  /** The project Featra is working in, or null; the Project scope's picker starts on it. */
  currentProject: ProjectRef | null;
  /** Projects the picker offers. Only the current one until STORY-19 brings the project list. */
  projects: ProjectRef[];
}

export const NO_TRAY_REASON = "This desktop has no system tray, so closing always quits Featra.";

function normalizeProjectRef(raw: unknown): ProjectRef | null {
  const r = record(raw);
  return typeof r.dir === "string" && r.dir && typeof r.name === "string" ? { dir: r.dir, name: r.name } : null;
}

function normalizeCloseToTray(raw: unknown): CloseToTraySupport {
  if (raw === null || raw === undefined) return null;
  const r = record(raw);
  if (r.available === true) return { available: true, place: r.place === "dock" ? "dock" : "tray" };
  return { available: false, reason: typeof r.reason === "string" && r.reason ? r.reason : NO_TRAY_REASON };
}

export function normalizeSettingsSnapshot(raw: unknown): SettingsSnapshot {
  const r = record(raw);
  const currentProject = normalizeProjectRef(r.currentProject);
  const projects = (Array.isArray(r.projects) ? r.projects : []).map(normalizeProjectRef).filter((p) => p !== null);
  if (currentProject && !projects.some((p) => p.dir === currentProject.dir)) projects.unshift(currentProject);
  return { app: normalizeAppSettings(r.app), closeToTray: normalizeCloseToTray(r.closeToTray), currentProject, projects };
}

export function normalizeProjectSettings(raw: unknown, dir: string): ProjectSettings {
  const r = record(raw);
  return {
    dir,
    overrides: normalizeWorkOverrides(r.overrides),
    error: typeof r.error === "string" && r.error ? r.error : null,
  };
}
