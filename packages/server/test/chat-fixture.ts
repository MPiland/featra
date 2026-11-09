/** A chat through the real session manager and Claude adapter, for tests: only `query` and the lookup are fake. */
import { foldChat, type ChatEvent } from "@featra/work-format";
import { createChatManager, type ChatManager, type ChatManagerDeps } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { fakeClaude } from "./fake-query.ts";
import { until } from "./until.ts";

export const DIR = "/home/me/demo";
const managers: ChatManager[] = [];

/** Ends every chat the tests started: call it after each test. */
export function closeChats() {
  for (const m of managers.splice(0)) m.close();
}

/** A chat started from `roleId`, with every event it records. */
export async function chat(
  roleId = "developer",
  claude = fakeClaude(),
  deps: Partial<Omit<ChatManagerDeps, "providers" | "roles">> = {},
) {
  const manager = createChatManager({
    providers: [createClaudeProvider(claude.deps)],
    roles: createRoleRegistry(),
    ...deps,
  });
  managers.push(manager);
  const id = await manager.start(DIR, roleId);
  const events: ChatEvent[] = [];
  manager.watch(id, (e) => events.push(e));
  return {
    ...claude,
    id,
    events,
    manager,
    send: (text: string) => manager.send(id, text),
    run: async (n = 0) => {
      await until(() => claude.runs.length > n && (claude.runs[n]?.heard.length ?? 0) > 0);
      return claude.runs[n]!;
    },
    view: () => foldChat(events),
  };
}
