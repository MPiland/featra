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

/**
 * Where the mode came from: a settings file (`local` is Claude's `settings.local.json`, `managed` the machine-wide
 * managed settings) or `agent`, the agent file's own `permissionMode`.
 */
export type SettingsLevel = "user" | "project" | "local" | "managed" | "agent";
const LEVELS: readonly SettingsLevel[] = ["user", "project", "local", "managed", "agent"];

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
  if (mode.level === null) return mode.name;
  if (mode.level === "agent") return `${mode.name} · from the agent`;
  return `${mode.name} · from ${SETTINGS_PROVIDER_NAMES[mode.provider]} settings`;
}

/** Which settings file, in words, for the label's tooltip. */
export function modeWhere(mode: ModeInfo): string | null {
  if (mode.level === null) return null;
  if (mode.level === "agent") return "Set in the agent's own file";
  const file = { user: "user", project: "project", local: "local project", managed: "managed" }[mode.level];
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

/** Why a role starts on Ask when its mode is bypassPermissions but Claude's settings switch full access off. */
export const BYPASS_DISABLED_NOTE = "Claude's settings turn off full access: starting on Ask.";

/** Why a role starts on Ask when its mode is auto but Claude's settings remove auto mode. */
export const AUTO_DISABLED_NOTE = "Claude's settings turn off auto mode: starting on Ask.";

/** The mode for a value of Claude's `permissionMode` or `permissions.defaultMode`, or null when it isn't one of them. */
export function claudeModeInfo(name: unknown, level: SettingsLevel): ModeInfo | null {
  if (!isOneOf(CLAUDE_MODES, name)) return null;
  return { provider: "claude", name, level, fullAccess: name === CLAUDE_FULL_ACCESS };
}
