import { useCallback, useEffect, useState } from "react";
import { SETTING_KEYS, type ChatControlState, type SettingsChange } from "@featra/work-format/chat-controls";
import type { Role } from "@featra/work-format/roles";
import type { ChatBridge } from "../../chats.ts";

/** What the composer's controls hold for one chat: the server's controls and settings, and the roles to pick from. */
export interface ChatControlsModel {
  state: ChatControlState | null;
  /** The roles of the chat's own agent: a chat's role can only change to one of these. */
  roles: Role[];
  /** The settings a user has changed in this view; what the header shows once they have. */
  changed: ReadonlySet<keyof ChatControlState["settings"]>;
  /** Applies a change from the next turn; resolves with why it wasn't taken, or null. */
  change: (change: SettingsChange) => Promise<string | null>;
}

/** Loads a chat's controls once, and keeps the settings the server answers to each change. */
export function useChatControls(
  chats: ChatBridge,
  id: string,
  dir: string,
  roleId: string,
  /** False for a subagent (STORY-55): it runs with its session's settings, so there is nothing to ask the server. */
  enabled = true,
): ChatControlsModel {
  const [state, setState] = useState<ChatControlState | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [changed, setChanged] = useState<ReadonlySet<keyof ChatControlState["settings"]>>(new Set());

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    void chats.controls(id).then((r) => live && r.ok && setState(r.state));
    void chats.roles(dir).then((all) => {
      if (!live) return;
      const own = all.find((r) => r.id === roleId)?.provider;
      setRoles(own ? all.filter((r) => r.provider === own) : []);
    });
    return () => {
      live = false;
    };
  }, [chats, id, dir, roleId, enabled]);

  const change = useCallback(
    async (next: SettingsChange) => {
      const result = await chats.configure(id, next);
      if (!result.ok) return result.error;
      setState(result.state);
      setChanged((was) => new Set([...was, ...SETTING_KEYS.filter((k) => k in next)]));
      return null;
    },
    [chats, id],
  );

  return { state, roles, changed, change };
}
