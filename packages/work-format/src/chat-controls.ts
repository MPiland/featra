/**
 * What a chat's composer can change (STORY-22) and the context meter's numbers. Provider neutral: each adapter lists
 * its own models, effort levels and permission modes under the provider's own names, and the composer shows those.
 */
import { isRecord } from "./utils/guards.ts";

/** One value a control offers: the provider's own name for it (`value`), and what the composer shows. */
export interface ControlChoice {
  value: string;
  label: string;
  /** The agent runs tools without asking: shown with a warning mark. */
  fullAccess?: boolean;
}

/** What a chat's provider lets the composer pick from. An empty list means the provider has no such control. */
export interface ChatControls {
  models: ControlChoice[];
  efforts: ControlChoice[];
  modes: ControlChoice[];
}

/** What a chat runs with: its role's id, and the provider's own names for model, effort and permission mode. */
export interface ChatSettings {
  role: string;
  model: string;
  effort: string;
  mode: string;
}

/** What the composer changes: any of the settings; the rest stay as they are. */
export type SettingsChange = Partial<ChatSettings>;
export const SETTING_KEYS = ["role", "model", "effort", "mode"] as const;

/** A chat's controls and the settings it runs with now, as `chat.controls` and `chat.configure` answer. */
export interface ChatControlState {
  controls: ChatControls;
  settings: ChatSettings;
}

/** The chat's context, from the agent session's own events: tokens in use, and the model's window when it said. */
export interface ChatUsage {
  used: number;
  window: number | null;
}

const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function normalizeChoices(raw: unknown): ControlChoice[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c): ControlChoice[] =>
    isRecord(c) && text(c.value) && text(c.label)
      ? [{ value: c.value, label: c.label, ...(c.fullAccess === true ? { fullAccess: true } : {}) }]
      : [],
  );
}

/** Settings read from the socket or a saved chat, or null. */
export function normalizeSettings(raw: unknown): ChatSettings | null {
  if (!isRecord(raw)) return null;
  const { role, model, effort, mode } = raw;
  return text(role) && text(model) && typeof effort === "string" && text(mode) ? { role, model, effort, mode } : null;
}

export function normalizeControlState(raw: unknown): ChatControlState | null {
  if (!isRecord(raw) || !isRecord(raw.controls)) return null;
  const settings = normalizeSettings(raw.settings);
  if (!settings) return null;
  const { models, efforts, modes } = raw.controls;
  return {
    controls: { models: normalizeChoices(models), efforts: normalizeChoices(efforts), modes: normalizeChoices(modes) },
    settings,
  };
}

/** The `{ id, change }` params of `chat.configure`, or null. A change names at least one setting, each one text. */
export function chatConfigureParams(params: unknown): { id: string; change: SettingsChange } | null {
  if (!isRecord(params) || !text(params.id) || !isRecord(params.change)) return null;
  const change: SettingsChange = {};
  for (const key of SETTING_KEYS) {
    const value = params.change[key];
    if (value === undefined) continue;
    if (!text(value)) return null;
    change[key] = value;
  }
  return Object.keys(change).length > 0 ? { id: params.id, change } : null;
}

/** A usage read from the socket, or null. */
export function normalizeUsage(used: unknown, window: unknown): ChatUsage | null {
  if (typeof used !== "number" || !Number.isFinite(used) || used < 0) return null;
  const sized = typeof window === "number" && Number.isFinite(window) && window > 0;
  return { used, window: sized ? window : null };
}

const short = (v: number, unit: string) => `${String(Math.round(v * 10) / 10)}${unit}`;

/** A token count in few characters: 842, 12.3k, 200k, 1M. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return short(n / 1_000_000, "M");
  if (n >= 1000) return short(n / 1000, "k");
  return String(Math.round(n));
}

/** The meter's text: "12.3k / 200k tokens", or "12.3k tokens" when the provider didn't give the window. */
export function meterText(usage: ChatUsage): string {
  return usage.window === null
    ? `${formatTokens(usage.used)} tokens`
    : `${formatTokens(usage.used)} / ${formatTokens(usage.window)} tokens`;
}

/** Whole percent of the window in use, capped at 100; null without a window. */
export function meterPercent(usage: ChatUsage): number | null {
  return usage.window === null ? null : Math.min(100, Math.round((usage.used / usage.window) * 100));
}

/** The settings a change leaves, and the keys it actually changes. */
export function applyChange(settings: ChatSettings, change: SettingsChange): ChatSettings {
  return { ...settings, ...change };
}

/** Whether `value` is one of `choices`. */
export const offers = (choices: readonly ControlChoice[], value: string) => choices.some((c) => c.value === value);
