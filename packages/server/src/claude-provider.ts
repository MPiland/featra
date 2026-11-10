/**
 * The Claude provider adapter (ADRs 0007, 0018): one chat is one Agent SDK query in streaming-input mode, run by the
 * user's own `claude` in the project folder, with the role's prompt appended to Claude Code's system prompt and the
 * role's model and effort. `settingSources` keeps the SDK default, so CLAUDE.md, skills and hooks load as usual.
 */
import type { CanUseTool, Options, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  EFFORTS,
  errorMessage,
  isOneOf,
  type ChatEvent,
  type ChatSettings,
  type PermissionMode,
  type Role,
} from "@featra/work-format";
import { claudeControls, claudeSettings, sdkMode } from "./claude-controls.ts";
import { createClaudeTranslator, FAILED } from "./claude-messages.ts";
import { claudeQuestions, questionResult } from "./claude-question.ts";
import { sessionRules, suggestedRule } from "./claude-rules.ts";
import { loadSessionReader } from "./claude-sdk.ts";
import { claudeHistory, type SessionReader } from "./claude-transcript.ts";
import { createInputQueue, type InputQueue } from "./input-queue.ts";
import type { McpServerSpec, ProviderAdapter, ProviderSession, SessionOptions } from "./provider.ts";

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

/**
 * The SDK's permission mode for each of a role's modes. Ask is the SDK's default: the user's own Claude rules apply,
 * and every other tool that needs approval goes to `canUseTool` (ADR 0018). The modes the composer switches between are in `claude-controls.ts` (ADR 0020).
 */
export const SDK_PERMISSION_MODES: Record<PermissionMode, NonNullable<Options["permissionMode"]>> = { ask: "default" };

/** The query options for a role's chat, with the model, effort and mode the composer last chose (default: the role's). */
export function claudeOptions(
  role: Role,
  cwd: string,
  claude: string,
  canUseTool: CanUseTool,
  env: NodeJS.ProcessEnv,
  resume: string | null,
  mcp: McpServerSpec | null = null,
  settings: ChatSettings = claudeSettings(role),
): Options {
  return {
    cwd,
    model: settings.model,
    effort: isOneOf(EFFORTS, settings.effort) ? settings.effort : role.effort,
    systemPrompt: { type: "preset", preset: "claude_code", append: role.prompt },
    pathToClaudeCodeExecutable: claude,
    ...sdkMode(settings.mode),
    includePartialMessages: true,
    canUseTool,
    env,
    ...(resume ? { resume } : {}),
    ...(mcp ? mcpOptions(mcp) : {}),
  };
}

/**
 * Featra's own MCP as Claude takes it: a stdio server, with its tools allowed without asking. Only these tools: the
 * user's own allow and deny rules, and Ask for everything else, stand as before (ADR 0018, ADR 0019).
 */
function mcpOptions({ name, command, args, env }: McpServerSpec): Pick<Options, "mcpServers" | "allowedTools"> {
  return { mcpServers: { [name]: { type: "stdio", command, args, env } }, allowedTools: [`mcp__${name}`] };
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
    controls: claudeControls,
    settings: claudeSettings,
    start: (options) => startSession(options, { loadQuery, locate, env }),
    history: async (session, cwd) => claudeHistory(await loadSessions(), session, cwd),
  };
}

function startSession(
  { cwd, role: startRole, approve, ask, emit, resume, mcp }: SessionOptions,
  { loadQuery, locate, env }: Omit<Required<ClaudeDeps>, "loadSessions">,
): ProviderSession {
  // A restored chat resumes its session; the agent's own report of its session id takes over once it starts.
  const translator = createClaudeTranslator(resume ?? null);
  let input: InputQueue<SDKUserMessage> | null = null;
  let query: ClaudeQuery | null = null;
  let closed = false;
  let turn = new AbortController();
  // What the next turn runs with: the composer's changes land here, and a running agent is replaced before the next
  // message if it was started with something else (the SDK takes the prompt, model, effort and mode when it starts).
  let role = startRole;
  let settings = claudeSettings(role);
  let startedWith = "";
  const configKey = () => JSON.stringify([role.prompt, settings]);
  /** A turn is open from its message until its turn-end. */
  let open = false;

  const canUseTool: CanUseTool = async (name, toolInput, options) => {
    const { signal, toolUseID, suppressAlwaysAllowRule, suggestions } = options;
    // The agent asks the user to choose: a card, not an approval.
    const asked = claudeQuestions(name, toolInput);
    if (asked && "refusal" in asked) return asked.refusal;
    if (asked) {
      const request = { id: toolUseID, name, questions: asked.questions };
      return questionResult(toolInput, await ask(request, AbortSignal.any([signal, turn.signal])));
    }
    // Claude says not to offer an always-allow for this call: Allow for this chat isn't offered either.
    const forChat = suppressAlwaysAllowRule !== true;
    const rules = forChat ? sessionRules(suggestions) : [];
    const suggested = suggestedRule(rules);
    const request = { id: toolUseID, name, input: toolInput, forChat, ...(suggested ? { suggested } : {}) };
    const decision = await approve(request, AbortSignal.any([signal, turn.signal]));
    // Allow for this chat on Claude's suggestion hands back the very rules suggested: Claude applies them.
    const chosen = decision.allow && suggested !== null && decision.rule === suggested.rule;
    return decision.allow
      ? { behavior: "allow", updatedInput: decision.input, ...(chosen ? { updatedPermissions: rules } : {}) }
      : { behavior: "deny", message: decision.message, ...(decision.interrupt ? { interrupt: true } : {}) };
  };

  const relay = (e: ChatEvent) => {
    if (e.type === "turn-end") open = false;
    emit(e);
  };

  const fail = (events: ChatEvent[]) => {
    // The agent is gone: a request it was waiting on ends before the turn does.
    turn.abort();
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
    // What this agent starts with, taken before anything is awaited: a change made while it starts differs from this
    // key, so the next message replaces the agent, and never relies on a message being held back.
    const starting = { role, settings };
    startedWith = configKey();
    const claude = await locate();
    if (closed || stoppedEarly()) return;
    if (!claude) return fail([{ type: "problem", problem: { type: "not-installed" } }, END_FAILED]);
    let running: ClaudeQuery;
    try {
      const attached = (await mcp?.()) ?? null;
      const options = claudeOptions(
        starting.role,
        cwd,
        claude,
        canUseTool,
        agentEnv(env),
        translator.sessionId(),
        attached,
        starting.settings,
      );
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
      // The agent was started with other settings: end it quietly, and the next one resumes the same session.
      if (input && startedWith !== configKey()) {
        input.close();
        input = null;
        query = null;
      }
      const queue = input ?? createInputQueue<SDKUserMessage>();
      queue.push(userMessage(text, translator.sessionId()));
      if (input) return;
      input = queue;
      run(queue).catch((err: unknown) => {
        // Finding `claude` failed, or telling the chat did: end the turn, never leave the rejection loose.
        if (!closed && input === queue) fail([failed(errorMessage(err)), END_FAILED]);
      });
    },
    configure(next, nextSettings) {
      role = next;
      settings = nextSettings;
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
