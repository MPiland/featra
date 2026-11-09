/**
 * Permission modes a chat starts in (STORY-6, decisions.md "Role permission modes start from the provider's own
 * settings"). The provider's own settings pick the mode and Featra only reads them; with none, the chat starts on Ask.
 * Each provider keeps its own names, so there is no Featra-wide set: a `ModeInfo` carries the provider's name for it.
 */
import { isOneOf, isRecord } from "./utils/guards.ts";

/** The providers whose settings Featra reads. Only Claude runs chats in M1; Codex runs in M2 (ADR 0018). */
export type SettingsProvider = "claude" | "codex";
export const SETTINGS_PROVIDERS: readonly SettingsProvider[] = ["claude", "codex"];
export const SETTINGS_PROVIDER_NAMES: Record<SettingsProvider, string> = { claude: "Claude", codex: "Codex" };

/** Claude's own permission mode names (`permissions.defaultMode`). */
export const CLAUDE_MODES = ["default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions"] as const;
export type ClaudeMode = (typeof CLAUDE_MODES)[number];
/** Claude's mode that lets the agent do anything without asking. */
export const CLAUDE_FULL_ACCESS: ClaudeMode = "bypassPermissions";

/** Codex's approval policies and sandbox modes (`approval_policy`, `sandbox_mode`). */
export const CODEX_APPROVALS = ["untrusted", "on-failure", "on-request", "never"] as const;
export const CODEX_SANDBOXES = ["read-only", "workspace-write", "danger-full-access"] as const;

/** Which settings file the mode came from; `local` is Claude's `settings.local.json`. */
export type SettingsLevel = "user" | "project" | "local";
const LEVELS: readonly SettingsLevel[] = ["user", "project", "local"];

/** The mode a chat starts in: from the provider's settings, or Featra's own Ask when they name none. */
export interface ModeInfo {
  provider: SettingsProvider;
  /** The provider's own name for it ("acceptEdits", "on-request · workspace-write"); "Ask" with no setting. */
  name: string;
  /** The settings file it came from; null for Ask. */
  level: SettingsLevel | null;
  /** The agent may do anything without asking: shown with a warning mark. */
  fullAccess: boolean;
}

/** Featra's own mode with no setting found: every tool that needs approval asks (STORY-45). */
export const ASK_MODE: ModeInfo = { provider: "claude", name: "Ask", level: null, fullAccess: false };

/** The mode's text: its name, and where it came from ("auto · from Claude settings"). */
export function modeLabel(mode: ModeInfo): string {
  return mode.level === null ? mode.name : `${mode.name} · from ${SETTINGS_PROVIDER_NAMES[mode.provider]} settings`;
}

/** Which settings file, in words, for the label's tooltip. */
export function modeWhere(mode: ModeInfo): string | null {
  if (mode.level === null) return null;
  const file = { user: "user", project: "project", local: "local project" }[mode.level];
  return `Set in ${SETTINGS_PROVIDER_NAMES[mode.provider]}'s ${file} settings`;
}

/** The warning mark's text for a full-access mode. */
export const FULL_ACCESS_WARNING = "Full access: the agent runs tools without asking";

/** A mode read from the socket, or null when it isn't one. */
export function normalizeMode(raw: unknown): ModeInfo | null {
  if (!isRecord(raw)) return null;
  const { provider, name, level, fullAccess } = raw;
  if (!isOneOf(SETTINGS_PROVIDERS, provider) || typeof name !== "string" || !name) return null;
  if (level !== null && !isOneOf(LEVELS, level)) return null;
  return { provider, name, level, fullAccess: fullAccess === true };
}
