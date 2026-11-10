/**
 * The composer's change to a chat (STORY-22): which role and settings the next turn runs with, checked against what the
 * chat's provider offers. Pure of the chat's own state: the manager applies the result.
 */
import {
  applyChange,
  CHAT_MESSAGES,
  offers,
  type ChatSettings,
  type Role,
  type SettingsChange,
} from "@featra/work-format";
import { ChatError } from "./chat-error.ts";
import type { ProviderAdapter } from "./provider.ts";

/** What the chat runs as now. */
export interface Running {
  role: Role;
  settings: ChatSettings;
}

/**
 * The role and settings after `change`, or a refusal. A different role brings its own model, effort and mode, and the
 * rest of the change goes over them; a role of another provider, or a value the provider doesn't offer, is refused.
 * `find` reads a role by id.
 */
export async function changedSettings(
  adapter: ProviderAdapter,
  now: Running,
  change: SettingsChange,
  find: (id: string) => Promise<Role | null>,
): Promise<Running> {
  let { role, settings } = now;
  if (change.role !== undefined && change.role !== role.id) {
    const next = await find(change.role);
    if (!next) throw new ChatError(CHAT_MESSAGES.unknownRole);
    if (next.provider !== adapter.id) throw new ChatError(CHAT_MESSAGES.otherAgent);
    role = next;
    settings = adapter.settings(next);
  }
  const next = applyChange(settings, { ...change, role: role.id });
  const { models, efforts, modes } = adapter.controls(role);
  const fits =
    offers(models, next.model) && offers(modes, next.mode) && (efforts.length === 0 || offers(efforts, next.effort));
  if (!fits) throw new ChatError(CHAT_MESSAGES.badSetting);
  return { role, settings: next };
}
