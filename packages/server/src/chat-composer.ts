/** What the session manager keeps of a chat's composer choices (STORY-22): applied to the chat, and saved with it. */
import {
  CHAT_MESSAGES,
  EFFORTS,
  isOneOf,
  type ChatControlState,
  type ChatSettings,
  type Role,
  type SavedComposer,
  type SettingsChange,
} from "@featra/work-format";
import { changedSettings, modeInfo, offered, startingState } from "./chat-configure.ts";
import { ChatError } from "./chat-error.ts";
import type { Chat } from "./chat-state.ts";
import type { ProviderAdapter } from "./provider.ts";

/**
 * What to save of the chat's composer: its settings while its agent exists, else what it was loaded with. A chat still
 * as its role starts it, with no window yet, saves nothing: reopening it starts it the same way.
 */
export function composerOf(c: Chat, adapter: ProviderAdapter | undefined): SavedComposer | null {
  if (!c.settings || !c.role) return c.kept;
  const { settings, window, fullAccess } = c;
  if (adapter && window === null) {
    const start = startingState(adapter, c.role);
    if (fullAccess === start.fullAccess && JSON.stringify(settings) === JSON.stringify(start.settings)) return null;
  }
  return { settings, window, fullAccess };
}

/**
 * Gives the chat the role and settings it now runs with: its own fields, the mode its header names, and its row, which
 * shows the model and effort it runs with, not the role's. Returns whether the row changed.
 */
export function applyState(
  c: Chat,
  adapter: ProviderAdapter,
  role: Role,
  state: { settings: ChatSettings; fullAccess: boolean },
): boolean {
  const { settings } = state;
  c.role = role;
  c.settings = settings;
  c.fullAccess = state.fullAccess;
  c.mode = modeInfo(adapter, role, settings);
  c.note = role.note ?? null;
  const row = c.summary.role;
  const effort = isOneOf(EFFORTS, settings.effort) ? settings.effort : role.effort;
  if (row.id === role.id && row.name === role.name && row.model === settings.model && row.effort === effort)
    return false;
  c.summary = {
    ...c.summary,
    role: { id: role.id, name: role.name, model: settings.model, effort },
  };
  return true;
}

/** The chat's controls and settings; refused for a chat with no agent (its role or provider is missing). */
export function controlState(c: Chat, adapter: ProviderAdapter | undefined): ChatControlState {
  if (!adapter || !c.role || !c.settings) throw new ChatError(c.refusal ?? CHAT_MESSAGES.noProvider);
  return { controls: offered(adapter, c.role, c.fullAccess), settings: c.settings };
}

/**
 * Applies a composer change to an open chat and its agent. Returns whether the chat's row changed. A change of model
 * drops the window the last turn reported: it was the old model's, and the next turn reports the new one's.
 */
export async function configureChat(
  c: Chat,
  adapter: ProviderAdapter | undefined,
  change: SettingsChange,
  find: (id: string) => Promise<Role | null>,
): Promise<boolean> {
  const before = controlState(c, adapter);
  if (!adapter || !c.role || !c.agent) throw new ChatError(c.refusal ?? CHAT_MESSAGES.noProvider);
  const next = await changedSettings(
    adapter,
    { role: c.role, settings: before.settings, fullAccess: c.fullAccess },
    change,
    find,
  );
  if (next.settings.model !== before.settings.model) c.window = null;
  const rowChanged = applyState(c, adapter, next.role, next);
  c.agent.configure(next.role, next.settings);
  return rowChanged;
}
