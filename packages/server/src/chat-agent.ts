import type { ChatEvent, Role } from "@featra/work-format";
import type { ApprovalDesk } from "./approval-desk.ts";
import { applyState } from "./chat-composer.ts";
import { restoredState } from "./chat-configure.ts";
import type { ChatManagerDeps } from "./chat-manager-types.ts";
import type { Chat } from "./chat-state.ts";
import type { ApprovalHandler, ProviderAdapter, ProviderSession } from "./provider.ts";

export interface AgentFactoryHost {
  mcp: ChatManagerDeps["mcp"];
  decide: ApprovalHandler;
  desk: ApprovalDesk;
  record: (c: Chat, event: ChatEvent) => void;
  listChanged: (dir: string) => void;
}

/** Makes a chat's agent session, through its provider; the session starts its agent with the first message. */
export function createAgentFactory({ mcp, decide, desk, record, listChanged }: AgentFactoryHost) {
  return function agentFor(
    c: Chat,
    adapter: ProviderAdapter,
    role: Role,
    inherited: readonly unknown[] = [],
  ): ProviderSession {
    // The session reaches the chat only through `emit`, so the chat's own fields are current when it is called.
    const emit = (event: ChatEvent) => record(c, event);
    // A reopened chat goes on with what the composer last set, while the provider still offers it.
    const state = restoredState(adapter, role, c.kept);
    if (c.kept && state.settings.model !== c.kept.settings.model) c.window = null;
    c.kept = null;
    const rowChanged = applyState(c, adapter, role, state);
    const agent = adapter.start({
      chat: c.id,
      cwd: c.cwd,
      role,
      emit,
      resume: c.session,
      ...(inherited.length > 0 ? { inherited } : {}),
      ...(mcp ? { mcp: () => mcp.attach({ id: c.id, dir: c.dir }) } : {}),
      approve: (request, signal) => decide({ ...request, chat: c.id, cwd: c.cwd }, signal),
      ask: (request, signal) => desk.ask({ ...request, chat: c.id }, signal),
    });
    agent.configure(role, state.settings);
    if (rowChanged && c.events !== null) listChanged(c.dir);
    return agent;
  };
}
