/**
 * The Claude provider adapter (ADRs 0007, 0018): one chat is one Agent SDK query in streaming-input mode, run by the
 * user's own `claude` in the project folder, with the role's prompt appended to Claude Code's system prompt and the
 * role's model and effort. `settingSources` keeps the SDK default, so CLAUDE.md, skills and hooks load as usual.
 */
import type { CanUseTool, Options, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { errorMessage, type ChatEvent, type Role } from "@featra/work-format";
import { createClaudeTranslator, FAILED } from "./claude-messages.ts";
import { loadSessionReader } from "./claude-sdk.ts";
import { claudeHistory, type SessionReader } from "./claude-transcript.ts";
import { createInputQueue, type InputQueue } from "./input-queue.ts";
import type { ProviderAdapter, ProviderSession, SessionOptions } from "./provider.ts";

/** A running query: the agent's messages, and how to stop its turn. */
export type ClaudeQuery = AsyncIterable<unknown> & { interrupt: () => Promise<unknown> };

/** The SDK's `query`, narrowed to how Featra calls it. Tests fake it here, at the package boundary. */
export type QueryFn = (args: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => ClaudeQuery;

export interface ClaudeDeps {
  /** Loads the Agent SDK's `query` (lazily: the SDK is large and only chats need it). */
  loadQuery: () => Promise<QueryFn>;
  /** The user's `claude`, or null when it isn't installed. */
  locate: () => Promise<string | null>;
  /** The agent's environment. */
  env?: NodeJS.ProcessEnv;
  /** Loads the reader of Claude's session files; the SDK's own by default. */
  loadSessions?: () => Promise<SessionReader>;
}

/** The Claude provider's name in the chat list, as the chat's problems name it too. */
export const CLAUDE_NAME = "Claude Code";

/** The agent's environment: the user's, without the flag that makes Electron run the server as Node. */
export function agentEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { ELECTRON_RUN_AS_NODE: _flag, ...rest } = env;
  return rest;
}

/** The query options for a role's chat. */
export function claudeOptions(
  role: Role,
  cwd: string,
  claude: string,
  canUseTool: CanUseTool,
  env: NodeJS.ProcessEnv,
  resume: string | null,
): Options {
  return {
    cwd,
    model: role.model,
    effort: role.effort,
    systemPrompt: { type: "preset", preset: "claude_code", append: role.prompt },
    pathToClaudeCodeExecutable: claude,
    // Ask: every tool that needs approval goes to canUseTool. STORY-22 adds the other modes.
    permissionMode: "default",
    includePartialMessages: true,
    canUseTool,
    env,
    ...(resume ? { resume } : {}),
  };
}

const userMessage = (text: string, session: string | null): SDKUserMessage => ({
  type: "user",
  message: { role: "user", content: text },
  parent_tool_use_id: null,
  session_id: session ?? "",
});

export function createClaudeProvider({
  loadQuery,
  locate,
  env = process.env,
  loadSessions = loadSessionReader,
}: ClaudeDeps): ProviderAdapter {
  return {
    id: "claude",
    name: CLAUDE_NAME,
    installed: async () => (await locate()) !== null,
    start: (options) => startSession(options, { loadQuery, locate, env }),
    history: async (session, cwd) => claudeHistory(await loadSessions(), session, cwd),
  };
}

function startSession(
  { cwd, role, approve, emit, resume }: SessionOptions,
  { loadQuery, locate, env }: Omit<Required<ClaudeDeps>, "loadSessions">,
): ProviderSession {
  // A restored chat resumes its session; the agent's own report of its session id takes over once it starts.
  const translator = createClaudeTranslator(resume ?? null);
  let input: InputQueue<SDKUserMessage> | null = null;
  let query: ClaudeQuery | null = null;
  let closed = false;
  let turn = new AbortController();
  /** A turn is open from its message until its turn-end. */
  let open = false;

  const canUseTool: CanUseTool = async (name, toolInput, { signal, toolUseID }) => {
    const decision = await approve({ id: toolUseID, name, input: toolInput }, AbortSignal.any([signal, turn.signal]));
    return decision.allow
      ? { behavior: "allow", updatedInput: decision.input }
      : { behavior: "deny", message: decision.message };
  };

  const relay = (e: ChatEvent) => {
    if (e.type === "turn-end") open = false;
    emit(e);
  };

  const fail = (events: ChatEvent[]) => {
    input?.close();
    input = null;
    query = null;
    for (const e of events) relay(e);
  };

  /** Before the agent is running, Stop ends the turn here: nothing was sent, so the next message starts afresh. */
  const stoppedEarly = () => {
    if (!turn.signal.aborted) return false;
    fail([END_STOPPED]);
    return true;
  };

  /** Starts the agent, then relays its stream until it ends. A later message starts it again, resuming. */
  async function run(queue: InputQueue<SDKUserMessage>) {
    const claude = await locate();
    if (closed || stoppedEarly()) return;
    if (!claude) return fail([{ type: "problem", problem: { type: "not-installed" } }, END_FAILED]);
    let running: ClaudeQuery;
    try {
      const options = claudeOptions(role, cwd, claude, canUseTool, agentEnv(env), translator.sessionId());
      const queryFn = await loadQuery();
      if (closed || stoppedEarly()) return;
      running = queryFn({ prompt: queue.iterable, options });
    } catch (err) {
      return fail([failed(errorMessage(err)), END_FAILED]);
    }
    query = running;
    let mid = false;
    try {
      for await (const message of running) {
        for (const e of translator.translate(message)) {
          if (e.type === "turn-end") mid = false;
          else if (e.type !== "started") mid = true;
          relay(e);
        }
      }
    } catch (err) {
      // Only this query's own failure: a newer one may have taken over.
      if (!closed && query === running) fail([failed(errorMessage(err)), END_FAILED]);
      return;
    }
    // The agent ended on its own: a turn it left open fails, and the next message starts it again.
    if (!closed && query === running) fail(mid ? [failed(FAILED), END_FAILED] : []);
  }

  return {
    send(text) {
      if (closed) return;
      turn = new AbortController();
      open = true;
      translator.newTurn();
      const queue = input ?? createInputQueue<SDKUserMessage>();
      queue.push(userMessage(text, translator.sessionId()));
      if (input) return;
      input = queue;
      run(queue).catch((err: unknown) => {
        // Finding `claude` failed, or telling the chat did: end the turn, never leave the rejection loose.
        if (!closed && input === queue) fail([failed(errorMessage(err)), END_FAILED]);
      });
    },
    async interrupt() {
      if (!open) return;
      turn.abort();
      // Only a turn the agent is running reads its result as stopped; before that, run() ends it (stoppedEarly).
      if (!query) return;
      translator.interrupted();
      await query.interrupt();
    },
    close() {
      closed = true;
      turn.abort();
      input?.close();
      input = null;
      query = null;
    },
    sessionId: () => translator.sessionId(),
  };
}

const END_FAILED: ChatEvent = { type: "turn-end", outcome: "failed" };
const END_STOPPED: ChatEvent = { type: "turn-end", outcome: "stopped" };
const failed = (message: string): ChatEvent => ({ type: "problem", problem: { type: "failed", message } });
