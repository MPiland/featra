/**
 * The Agent SDK's `query`, faked at the package boundary (ADR 0013): it records each call's options and the user
 * messages it is fed, and the test plays the agent by pushing SDK messages. Everything Featra does with them is real.
 */
import type { CanUseTool, Options, PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeDeps, ClaudeQuery, QueryFn } from "../src/claude-provider.ts";
import { createInputQueue } from "../src/input-queue.ts";

export interface FakeRun {
  options: Options;
  /** The text of each user message the agent has read so far. */
  heard: string[];
  /** Plays the agent: each message goes out on the stream. */
  say: (...messages: unknown[]) => void;
  /** Ends the stream, as when `claude` exits. */
  end: () => void;
  /** Throws from the stream, as when `claude` crashes. */
  crash: (error: Error) => void;
  interrupts: number;
  /** The task ids `stopTask` was asked to end (STORY-55). */
  stopped: string[];
  /** What an interrupt does besides counting: a test makes it fail or never finish, as a stuck provider does. */
  onInterrupt: (() => Promise<void>) | null;
  /** True once Featra has closed its input: the session is over. */
  closed: boolean;
  /** The permission updates Featra returned with an allow, in order: Claude applies these. */
  updates: PermissionUpdate[];
  /**
   * Asks Featra whether a tool may run, as `claude` does before a tool that needs approval. `extra` adds the SDK's
   * other request options (its own abort signal, `suppressAlwaysAllowRule`, `suggestions`). As Claude does, a call a
   * session allow rule covers is allowed without asking; the fake matches a rule by tool name and its `command`,
   * exactly or by a `prefix:*` content, which is all the tests use.
   */
  ask: (
    name: string,
    input: Record<string, unknown>,
    id: string,
    extra?: Partial<Parameters<CanUseTool>[2]>,
  ) => ReturnType<CanUseTool>;
}

const covers = (content: string | undefined, command: unknown) =>
  content === undefined ||
  (typeof command === "string" &&
    (content.endsWith(":*") ? command.startsWith(content.slice(0, -2)) : command === content));

export function fakeQuery() {
  const runs: FakeRun[] = [];
  const query: QueryFn = ({ prompt, options }) => {
    const out = createInputQueue<{ value: unknown } | { error: Error }>();
    const run: FakeRun = {
      options,
      heard: [],
      say: (...messages) => messages.forEach((value) => out.push({ value })),
      end: () => out.close(),
      crash: (error) => out.push({ error }),
      interrupts: 0,
      stopped: [],
      onInterrupt: null,
      closed: false,
      updates: [],
      ask: async (name, input, id, extra = {}) => {
        const canUseTool: CanUseTool | undefined = options.canUseTool;
        if (!canUseTool) throw new Error("No canUseTool");
        const covered = run.updates.some(
          (u) =>
            u.type === "addRules" &&
            u.behavior === "allow" &&
            u.destination === "session" &&
            u.rules.some((r) => r.toolName === name && covers(r.ruleContent, input.command)),
        );
        if (covered) return { behavior: "allow", updatedInput: input };
        const result = await canUseTool(name, input, {
          signal: new AbortController().signal,
          toolUseID: id,
          requestId: `request-${id}`,
          ...extra,
        });
        if (result?.behavior === "allow") run.updates.push(...(result.updatedPermissions ?? []));
        return result;
      },
    };
    runs.push(run);
    void (async () => {
      for await (const message of prompt) {
        const content = message.message.content;
        run.heard.push(typeof content === "string" ? content : JSON.stringify(content));
      }
      run.closed = true;
    })();
    async function* stream() {
      for await (const item of out.iterable) {
        if ("error" in item) throw item.error;
        yield item.value;
      }
    }
    const q: ClaudeQuery = Object.assign(stream(), {
      interrupt: async () => {
        run.interrupts += 1;
        await run.onInterrupt?.();
      },
      stopTask: async (task: string) => {
        run.stopped.push(task);
      },
    });
    return q;
  };
  return { query, runs };
}

/** The Claude adapter's platform: a fake `query` and a `claude` found (or not) on the PATH. */
export function fakeClaude(claude: string | null = "/usr/local/bin/claude", env: NodeJS.ProcessEnv = {}) {
  const fake = fakeQuery();
  const deps: ClaudeDeps = { loadQuery: async () => fake.query, locate: async () => claude, env };
  return { ...fake, deps };
}

const MAIN = { parent_tool_use_id: null };

/** SDK messages, shaped as the SDK sends them. */
export const sdk = {
  init: (model = "claude-sonnet-5-5", session = "session-1") => ({
    ...MAIN,
    type: "system",
    subtype: "init",
    session_id: session,
    model,
  }),
  start: (id: string) => ({ ...MAIN, type: "stream_event", event: { type: "message_start", message: { id } } }),
  delta: (text: string, index = 0) => ({
    ...MAIN,
    type: "stream_event",
    event: { type: "content_block_delta", index, delta: { type: "text_delta", text } },
  }),
  assistant: (id: string, content: unknown[], extra: Record<string, unknown> = {}, usage?: Record<string, number>) => ({
    ...MAIN,
    type: "assistant",
    message: { id, content, ...(usage ? { usage } : {}) },
    ...extra,
  }),
  text: (text: string) => ({ type: "text", text }),
  toolUse: (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }),
  toolResult: (id: string, content: unknown, isError = false) => ({
    ...MAIN,
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] },
  }),
  success: (result = "", extra: Record<string, unknown> = {}) => ({
    ...MAIN,
    type: "result",
    subtype: "success",
    is_error: false,
    result,
    ...extra,
  }),
  failure: (extra: Record<string, unknown> = {}) => ({
    ...MAIN,
    type: "result",
    subtype: "error_during_execution",
    is_error: true,
    errors: [],
    ...extra,
  }),

  /** A subagent's task starting (`task_started`): a background one by default. */
  taskStarted: (task: string, call: string, extra: Record<string, unknown> = {}) => ({
    ...MAIN,
    type: "system",
    subtype: "task_started",
    task_id: task,
    tool_use_id: call,
    description: "Review the diff",
    subagent_type: "reviewer",
    task_type: "local_agent",
    is_backgrounded: true,
    prompt: "Review the diff.",
    ...extra,
  }),
  taskUpdated: (task: string, patch: Record<string, unknown>) => ({
    ...MAIN,
    type: "system",
    subtype: "task_updated",
    task_id: task,
    patch,
  }),
  taskDone: (task: string, status: "completed" | "failed" | "stopped", summary = "") => ({
    ...MAIN,
    type: "system",
    subtype: "task_notification",
    task_id: task,
    status,
    summary,
  }),
  /** A message of a subagent's own conversation: `message` is one of the helpers above, tagged as the SDK tags it. */
  within: (call: string, task: string, message: object) => ({ ...message, parent_tool_use_id: call, agent_id: task }),
};
