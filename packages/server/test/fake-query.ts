/**
 * The Agent SDK's `query`, faked at the package boundary (ADR 0013): it records each call's options and the user
 * messages it is fed, and the test plays the agent by pushing SDK messages. Everything Featra does with them is real.
 */
import type { CanUseTool, Options } from "@anthropic-ai/claude-agent-sdk";
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
  /** Asks Featra whether a tool may run, as `claude` does before a tool that needs approval. */
  ask: (name: string, input: Record<string, unknown>, id: string) => ReturnType<CanUseTool>;
}

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
      ask: (name, input, id) => {
        const canUseTool: CanUseTool | undefined = options.canUseTool;
        if (!canUseTool) throw new Error("No canUseTool");
        return canUseTool(name, input, {
          signal: new AbortController().signal,
          toolUseID: id,
          requestId: `request-${id}`,
        });
      },
    };
    runs.push(run);
    void (async () => {
      for await (const message of prompt) {
        const content = message.message.content;
        run.heard.push(typeof content === "string" ? content : JSON.stringify(content));
      }
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
  assistant: (id: string, content: unknown[], extra: Record<string, unknown> = {}) => ({
    ...MAIN,
    type: "assistant",
    message: { id, content },
    ...extra,
  }),
  text: (text: string) => ({ type: "text", text }),
  toolUse: (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }),
  toolResult: (id: string, content: unknown, isError = false) => ({
    ...MAIN,
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] },
  }),
  success: (result = "") => ({ ...MAIN, type: "result", subtype: "success", is_error: false, result }),
  failure: (extra: Record<string, unknown> = {}) => ({
    ...MAIN,
    type: "result",
    subtype: "error_during_execution",
    is_error: true,
    errors: [],
    ...extra,
  }),
};
