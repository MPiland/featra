/**
 * The Agent SDK's `query`, faked for E2E runs (ADR 0013: the agent is faked at the SDK boundary, since CI has no
 * `claude` login). The server loads it through FEATRA_E2E_AGENT_SDK. Each user message picks a scripted reply by its
 * text; FEATRA_E2E_AGENT_LOG, when set, gets one JSON line per query with the options Featra passed.
 *
 * - "tool": a Read that runs, then a Bash `npm test` that needs approval, so it goes to canUseTool and waits on the
 *   user's answer. "twice" in the text asks for a second, identical Bash call after it.
 * - "slow": starts a reply and waits for interrupt().
 * - anything else: streams "You said: <text>".
 *
 * With CLAUDE_CONFIG_DIR set (STORY-44), each turn is also written to a session file there, as Claude writes it, so
 * the SDK's real reader can read it back after a restart. A resumed session (`options.resume`) goes on in that file,
 * and its reply names the earlier prompts it kept: "You said: <text>, after: <earlier>".
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

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

/** A Bash `npm test` call, asked about through canUseTool as the SDK asks; its result is what the answer allowed. */
async function* bash(options, signal) {
  const id = `toolu_bash_${++seq}`;
  const input = { command: "npm test" };
  yield assistant(`msg_${++seq}`, [{ type: "tool_use", id, name: "Bash", input }]);
  const decision = await options.canUseTool("Bash", input, { signal, toolUseID: id, requestId: `request_${seq}` });
  const allowed = decision.behavior === "allow";
  yield toolResult(id, allowed ? "ok" : decision.message, !allowed);
}

async function* toolTurn(options, signal, twice) {
  yield* say("Let me look.");
  yield assistant(`msg_${++seq}`, [
    { type: "tool_use", id: `toolu_read_${++seq}`, name: "Read", input: { file_path: "README.md" } },
  ]);
  yield toolResult(`toolu_read_${seq}`, "# Demo project", false);
  yield* bash(options, signal);
  if (twice) yield* bash(options, signal);
  yield* say("Done.");
  yield success("Done.");
}

/**
 * The session's file, where Claude keeps it: `projects/<the cwd, non-alphanumerics as "-">/<session>.jsonl`. Claude
 * names the folder after the cwd's real path, so on Windows a short 8.3 name (`RUNNER~1`) is spelled out in full.
 */
const sessionFile = (home, cwd, session) =>
  join(home, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"), `${session}.jsonl`);

/** The session's file, kept as Claude keeps it, when the test gave Claude a config folder of its own. */
function sessionLog(options) {
  const home = process.env.CLAUDE_CONFIG_DIR;
  if (!home) return { id: "fake-session", earlier: [], write: () => {} };
  const id = options.resume ?? randomUUID();
  const cwd = realpathSync.native(options.cwd);
  const file = sessionFile(home, cwd, id);
  const lines = existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
  let parent = lines.at(-1)?.uuid ?? null;
  const line = (type, message) => {
    const uuid = randomUUID();
    const entry = { type, parentUuid: parent, uuid, timestamp: new Date().toISOString(), isSidechain: false };
    parent = uuid;
    return JSON.stringify({
      ...entry,
      userType: "external",
      cwd,
      sessionId: id,
      version: "2.1.0",
      message,
    });
  };
  const earlier = lines.filter((l) => l.type === "user" && typeof l.message.content === "string");
  return {
    id,
    earlier: earlier.map((l) => l.message.content),
    write: (text, reply) => {
      mkdirSync(dirname(file), { recursive: true });
      const user = line("user", { role: "user", content: text });
      const answer = line("assistant", {
        id: `msg_${++seq}`,
        role: "assistant",
        content: [{ type: "text", text: reply }],
      });
      appendFileSync(file, `${user}\n${answer}\n`);
    },
  };
}

export function query({ prompt, options }) {
  const log = process.env.FEATRA_E2E_AGENT_LOG;
  if (log) {
    const { cwd, model, effort, systemPrompt, pathToClaudeCodeExecutable, permissionMode, settingSources } = options;
    const seen = { cwd, model, effort, systemPrompt, pathToClaudeCodeExecutable, permissionMode, settingSources };
    // Logged only when set, so the journeys that never resume see the options they always did.
    if (options.resume) seen.resume = options.resume;
    appendFileSync(log, `${JSON.stringify(seen)}\n`);
  }
  let release = null;
  const stopped = () => new Promise((resolve) => (release = resolve));
  // Aborted on interrupt(), as the SDK aborts a permission request when its turn is interrupted.
  let turn = new AbortController();

  const session = sessionLog(options);

  async function* run() {
    for await (const message of prompt) {
      const text = String(message.message.content);
      yield { ...MAIN, type: "system", subtype: "init", session_id: session.id, model: options.model };
      turn = new AbortController();
      if (text.includes("tool")) {
        yield* toolTurn(options, turn.signal, text.includes("twice"));
      } else if (text.includes("slow")) {
        const id = `msg_${++seq}`;
        const waiting = stopped();
        yield start(id);
        yield delta("Thinking it over");
        await waiting;
        yield { ...MAIN, type: "result", subtype: "error_during_execution", is_error: true, errors: [] };
      } else {
        const kept = session.earlier.length > 0 ? `, after: ${session.earlier.join(", ")}` : "";
        // Written before the reply shows, as Claude does, so a restart right after it finds the turn.
        session.write(text, `You said: ${text}${kept}`);
        session.earlier.push(text);
        yield* say("You said: ", text, ...(kept ? [kept] : []));
        yield success(`You said: ${text}${kept}`);
      }
    }
  }

  return Object.assign(run(), {
    interrupt: async () => {
      turn.abort();
      release?.();
    },
  });
}
