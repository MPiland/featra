/**
 * The Agent SDK's `query`, faked for E2E runs (ADR 0013: the agent is faked at the SDK boundary, since CI has no
 * `claude` login). The server loads it through FEATRA_E2E_AGENT_SDK. Each user message picks a scripted reply by its
 * text; FEATRA_E2E_AGENT_LOG, when set, gets one JSON line per query with the options Featra passed.
 *
 * - "tool": a Read that runs, then a Bash that needs approval, so it goes to canUseTool.
 * - "slow": starts a reply and waits for interrupt().
 * - anything else: streams "You said: <text>".
 */
import { appendFileSync } from "node:fs";

const MAIN = { parent_tool_use_id: null };
let seq = 0;

const start = (id) => ({ ...MAIN, type: "stream_event", event: { type: "message_start", message: { id } } });
const delta = (text) => ({
  ...MAIN,
  type: "stream_event",
  event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
});
const assistant = (id, content) => ({ ...MAIN, type: "assistant", message: { id, content } });
const toolResult = (id, content, isError) => ({
  ...MAIN,
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] },
});
const success = (text) => ({ ...MAIN, type: "result", subtype: "success", is_error: false, result: text });

/** A streamed text reply: deltas, then the full message the SDK sends after them. */
function* say(...parts) {
  const id = `msg_${++seq}`;
  yield start(id);
  for (const part of parts) yield delta(part);
  yield assistant(id, [{ type: "text", text: parts.join("") }]);
}

async function* toolTurn(options) {
  yield* say("Let me look.");
  yield assistant(`msg_${++seq}`, [
    { type: "tool_use", id: "toolu_read", name: "Read", input: { file_path: "README.md" } },
  ]);
  yield toolResult("toolu_read", "# Demo project", false);
  const input = { command: "npm test" };
  yield assistant(`msg_${++seq}`, [{ type: "tool_use", id: "toolu_bash", name: "Bash", input }]);
  const decision = await options.canUseTool("Bash", input, {
    signal: new AbortController().signal,
    toolUseID: "toolu_bash",
    requestId: "request_bash",
  });
  const allowed = decision.behavior === "allow";
  yield toolResult("toolu_bash", allowed ? "ok" : decision.message, !allowed);
  yield* say("Done.");
  yield success("Done.");
}

export function query({ prompt, options }) {
  const log = process.env.FEATRA_E2E_AGENT_LOG;
  if (log) {
    const { cwd, model, effort, systemPrompt, pathToClaudeCodeExecutable, permissionMode, settingSources } = options;
    const seen = { cwd, model, effort, systemPrompt, pathToClaudeCodeExecutable, permissionMode, settingSources };
    appendFileSync(log, `${JSON.stringify(seen)}\n`);
  }
  let release = null;
  const stopped = () => new Promise((resolve) => (release = resolve));

  async function* run() {
    for await (const message of prompt) {
      const text = String(message.message.content);
      yield { ...MAIN, type: "system", subtype: "init", session_id: "fake-session", model: options.model };
      if (text.includes("tool")) {
        yield* toolTurn(options);
      } else if (text.includes("slow")) {
        const id = `msg_${++seq}`;
        const waiting = stopped();
        yield start(id);
        yield delta("Thinking it over");
        await waiting;
        yield { ...MAIN, type: "result", subtype: "error_during_execution", is_error: true, errors: [] };
      } else {
        yield* say("You said: ", text);
        yield success(`You said: ${text}`);
      }
    }
  }

  return Object.assign(run(), { interrupt: async () => release?.() });
}
