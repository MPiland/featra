/**
 * What the composer can change in a Claude chat (STORY-22), under Claude's own names: the models it takes, the effort
 * levels and the permission modes. A chat starts from its role's model and effort and the mode Claude's settings name
 * (STORY-6); the composer's changes apply from the next turn (see `claude-provider.ts`).
 */
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import {
  CLAUDE_FULL_ACCESS,
  CLAUDE_MODES,
  EFFORTS,
  isOneOf,
  type ChatControls,
  type ChatSettings,
  type ClaudeMode,
  type ControlChoice,
  type Role,
} from "@featra/work-format";

/** The models the composer offers: Claude's aliases and their 1M-context forms. A role's own model is added to them. */
const MODELS = ["default", "sonnet", "opus", "haiku", "sonnet[1m]", "opus[1m]"];

/**
 * The models known to take adaptive thinking: the current Sonnet and Opus aliases and their 1M forms. Haiku, `default`
 * (whatever the account maps it to) and any other name get no thinking option: asking a model that doesn't take it
 * could fail its turns, and nothing here can check that without spending the user's tokens on a real run.
 */
const ADAPTIVE_THINKING = new Set(["sonnet", "opus", "sonnet[1m]", "opus[1m]"]);

/** The thinking option of a turn on `model`: summarized, so a watcher can read it (STORY-53), or none. */
export function thinkingOption(model: string): Pick<Options, "thinking"> {
  return ADAPTIVE_THINKING.has(model) ? { thinking: { type: "adaptive", display: "summarized" } } : {};
}

/** Claude's `default` mode is Featra's Ask (CONTEXT.md): every tool that needs approval asks. */
const MODE_LABELS: Partial<Record<ClaudeMode, string>> = { default: "default (Ask)" };

const choice = (value: string): ControlChoice => ({ value, label: value });

/** The mode a role's chat starts in: the one Claude's own settings name, else `default` (Ask). */
export function startModeName(role: Role): ClaudeMode {
  const { mode } = role;
  const named = mode?.provider === "claude" && mode.level !== null ? mode.name : null;
  return isOneOf(CLAUDE_MODES, named) ? named : "default";
}

/** The settings a chat from `role` starts with. */
export const claudeSettings = (role: Role): ChatSettings => ({
  role: role.id,
  model: role.model,
  effort: role.effort,
  mode: startModeName(role),
});

/**
 * What a chat from `role` can pick. Full access is offered only to a chat that already started in it: Featra passes on
 * what the user's own Claude settings allow, so the composer never switches a chat up to it. `auto` is offered unless
 * Claude's settings remove it (`disableAutoMode`).
 */
export function claudeControls(role: Role): ChatControls {
  const models = MODELS.includes(role.model) ? MODELS : [...MODELS, role.model];
  const start = startModeName(role);
  return {
    models: models.map(choice),
    efforts: EFFORTS.map(choice),
    modes: CLAUDE_MODES.filter(
      (m) => (m !== CLAUDE_FULL_ACCESS || start === CLAUDE_FULL_ACCESS) && (m !== "auto" || role.autoOff !== true),
    ).map((m): ControlChoice => {
      const mode: ControlChoice = { value: m, label: MODE_LABELS[m] ?? m };
      if (m === CLAUDE_FULL_ACCESS) mode.fullAccess = true;
      return mode;
    }),
  };
}

/** The SDK's permission mode for one of Claude's modes. Bypass needs the SDK's second opt-in. */
export function sdkMode(mode: string): Pick<Options, "permissionMode" | "allowDangerouslySkipPermissions"> {
  if (mode === "bypassPermissions")
    return { permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true };
  if (mode === "acceptEdits" || mode === "plan" || mode === "auto" || mode === "dontAsk")
    return { permissionMode: mode };
  return { permissionMode: "default" };
}
