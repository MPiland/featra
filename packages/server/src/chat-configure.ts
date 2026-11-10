/**
 * The composer's change to a chat (STORY-22): which role and settings the next turn runs with, checked against what the
 * chat's provider offers. Pure of the chat's own state: the manager applies the result.
 *
 * Full access has a ceiling: a chat that didn't start in it never reaches it, by a mode pick or through a role (ADR 0020).
 */
import {
  applyChange,
  CHAT_MESSAGES,
  offers,
  type ChatControls,
  type ChatSettings,
  type ModeInfo,
  type Role,
  type SettingsChange,
} from "@featra/work-format";
import { ChatError } from "./chat-error.ts";
import type { ProviderAdapter } from "./provider.ts";

/** What the chat runs as now. */
export interface Running {
  role: Role;
  settings: ChatSettings;
  /** The chat started in full access, so it may go back to it. */
  fullAccess: boolean;
}

/** What the chat may pick from: the provider's controls for its role, less full access unless the chat started in it. */
export function offered(adapter: ProviderAdapter, role: Role, fullAccess: boolean): ChatControls {
  const controls = adapter.controls(role);
  return fullAccess ? controls : { ...controls, modes: controls.modes.filter((m) => m.fullAccess !== true) };
}

/**
 * `settings` made to fit `controls`: a mode the chat may not use becomes the first mode the adapter lists, which is
 * its asking mode. The model and effort are the role's own, so they always fit.
 */
export function withinCeiling(settings: ChatSettings, controls: ChatControls): ChatSettings {
  const [asking] = controls.modes;
  return asking && !offers(controls.modes, settings.mode) ? { ...settings, mode: asking.value } : settings;
}

/** Whether `settings` are all values `controls` offers (an adapter with no effort levels takes any effort). */
export function fits(controls: ChatControls, settings: ChatSettings): boolean {
  return (
    offers(controls.models, settings.model) &&
    offers(controls.modes, settings.mode) &&
    (controls.efforts.length === 0 || offers(controls.efforts, settings.effort))
  );
}

/** What a chat starts with from `role`, and whether that is full access (the chat's ceiling). */
export function startingState(adapter: ProviderAdapter, role: Role): Pick<Running, "settings" | "fullAccess"> {
  const settings = adapter.settings(role);
  const fullAccess = adapter.controls(role).modes.some((m) => m.fullAccess === true && m.value === settings.mode);
  return { settings, fullAccess };
}

/**
 * What a reopened chat goes on with: what it was saved with, when that still fits what the provider offers its role
 * now (its full access only while the provider still allows it); otherwise the role's own.
 */
export function restoredState(
  adapter: ProviderAdapter,
  role: Role,
  saved: { settings: ChatSettings; fullAccess: boolean } | null,
): Pick<Running, "settings" | "fullAccess"> {
  const start = startingState(adapter, role);
  if (!saved) return start;
  const fullAccess = saved.fullAccess && adapter.controls(role).modes.some((m) => m.fullAccess === true);
  const controls = offered(adapter, role, fullAccess);
  const keep = saved.settings.role === role.id && fits(controls, saved.settings);
  return { settings: keep ? saved.settings : withinCeiling(start.settings, controls), fullAccess };
}

/** The mode the header names: the role's own while the chat is in its starting mode, else the picked one. */
export function modeInfo(adapter: ProviderAdapter, role: Role, settings: ChatSettings): ModeInfo | null {
  if (settings.mode === adapter.settings(role).mode) return role.mode ?? null;
  const full = adapter.controls(role).modes.some((m) => m.value === settings.mode && m.fullAccess === true);
  return { provider: adapter.id, name: settings.mode, level: null, fullAccess: full };
}

/**
 * The role and settings after `change`, or a refusal. A different role brings its own model, effort and mode, and the
 * rest of the change goes over them; a role of another provider, or a value the chat may not use, is refused. A role
 * whose own mode is full access doesn't carry it into a chat that didn't start in it: the chat stays in its asking
 * mode. `find` reads a role by id.
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
    settings = withinCeiling(adapter.settings(next), offered(adapter, next, now.fullAccess));
  }
  const next = applyChange(settings, { ...change, role: role.id });
  if (!fits(offered(adapter, role, now.fullAccess), next)) throw new ChatError(CHAT_MESSAGES.badSetting);
  return { role, settings: next, fullAccess: now.fullAccess };
}
