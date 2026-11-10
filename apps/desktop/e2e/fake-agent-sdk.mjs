/**
 * The Agent SDK's `query`, faked for E2E runs (ADR 0013: the agent is faked at the SDK boundary, since CI has no
 * `claude` login). The server loads it through FEATRA_E2E_AGENT_SDK. Each user message picks a scripted reply by its
 * text; FEATRA_E2E_AGENT_LOG, when set, gets one JSON line per query with the options Featra passed.
 *
 * - "tool": a Read that runs, then a Bash `npm test` that needs approval, so it goes to canUseTool and waits on the
 *   user's answer. "twice" in the text asks for a second, identical Bash call after it.
 * - "question": an AskUserQuestion call (a choice of one and a choice of several), asked through canUseTool; its result
 *   is the answers the user gave, as Claude hands them to the agent, and the reply says them back.
 * - "decide": starts the Featra MCP from options.mcpServers over stdio, as Claude does, and calls its log_decision tool
 *   (STORY-47). Without the MCP (it is off in the project) the reply says so. The tool call is real; only the agent is
 *   faked.
 * - "draft": calls the Featra MCP's draft_cards tool (STORY-8) to draft a feature with two stories. With "again" in the
 *   text it calls it a second time, giving back the IDs the first answer named, with the first story changed.
 * - "slow": starts a reply and waits for interrupt().
 * - anything else: streams "You said: <text>".
 *
 * Every assistant message reports its token use as the SDK does, growing by a thousand per user message (the first turn
 * uses 1234 tokens, the second 2234), and each result names the model's window (200000), except for the model
 * "haiku", whose result names none (STORY-22: the meter then shows tokens without a total).
 *
 * With CLAUDE_CONFIG_DIR set (STORY-44), each turn is also written to a session file there, as Claude writes it, so
 * the SDK's real reader can read it back after a restart. A resumed session (`options.resume`) goes on in that file,
 * and its reply names the earlier prompts it kept: "You said: <text>, after: <earlier>".
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const MAIN = { parent_tool_use_id: null };
let seq = 0;
/** The user messages answered so far, across agents: what the reported token use grows with. */
let turns = 0;
let sessionModel = "";

const start = (id) => ({ ...MAIN, type: "stream_event", event: { type: "message_start", message: { id } } });
const delta = (text) => ({
  ...MAIN,
  type: "stream_event",
  event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
});
const assistant = (id, content) => ({
  ...MAIN,
  type: "assistant",
  message: { id, content, usage: { input_tokens: 1000 * turns, output_tokens: 234 } },
});
const toolResult = (id, content, isError) => ({
  ...MAIN,
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] },
});
const success = (text) => ({
  ...MAIN,
  type: "result",
  subtype: "success",
  is_error: false,
  result: text,
  ...(sessionModel === "haiku" ? {} : { modelUsage: { [sessionModel]: { contextWindow: 200000 } } }),
});

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

/** Calls one tool of an MCP server over stdio (newline-delimited JSON-RPC), as an agent's host does. */
async function callMcpTool(spec, name, args) {
  const child = spawn(spec.command, spec.args ?? [], {
    env: { ...process.env, ...spec.env },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const waiting = new Map();
  let next = 0;
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const message = JSON.parse(line);
      waiting.get(message.id)?.(message);
    } catch {
      // Not a JSON-RPC line.
    }
  });
  const ended = () => {
    for (const answer of waiting.values()) answer({ error: { message: "The MCP server exited." } });
  };
  child.once("exit", ended);
  child.once("error", ended);
  const send = (message) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}
`);
  const call = (method, params) =>
    new Promise((resolve) => {
      const id = ++next;
      waiting.set(id, resolve);
      send({ id, method, params });
    });
  try {
    await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "fake", version: "0" },
    });
    send({ method: "notifications/initialized" });
    const reply = await call("tools/call", { name, arguments: args });
    if (reply.error) return { text: reply.error.message, isError: true };
    return { text: reply.result.content.map((c) => c.text).join(""), isError: reply.result.isError === true };
  } finally {
    child.kill();
  }
}

/** Logs a decision through the Featra MCP the way an agent would, when Featra gave it one. */
async function* decideTurn(options) {
  const spec = options.mcpServers?.featra;
  if (!spec) {
    yield* say("No Featra MCP.");
    yield success("No Featra MCP.");
    return;
  }
  const id = `toolu_mcp_${++seq}`;
  const input = {
    decision: "Keep entries in the working folder",
    why: "They are committed with the branch.",
    rejected: ["A central log: not versioned with the work"],
  };
  yield assistant(`msg_${++seq}`, [{ type: "tool_use", id, name: "mcp__featra__log_decision", input }]);
  const result = await callMcpTool(spec, "log_decision", input);
  yield toolResult(id, result.text, result.isError);
  yield* say(`Tool said: ${result.text}`);
  yield success("Done.");
}

/** The draft the fake Dev Lead makes; the second call keeps the stories it was given IDs for, with a change. */
const draftInput = (ids) => ({
  feature: { title: "Shaping", description: "Talk a feature through with the Dev Lead, then review it." },
  stories: [
    {
      ...(ids ? { id: ids[0] } : {}),
      title: "Draft a feature",
      story: "As a builder, I get a drafted feature, so that I can review it.",
      criteria: ids ? ["The draft shows in Work", "The draft says Review"] : ["The draft shows in Work"],
      tasks: ["Write the draft"],
    },
    {
      ...(ids ? { id: ids[1] } : {}),
      title: "Review the draft",
      story: "As a builder, I review the draft, so that I can approve it.",
      criteria: ["The review opens"],
      tasks: [],
    },
  ],
});
let lastDraft = "";

/** Drafts cards through the Featra MCP the way an agent would, when Featra gave it one. */
async function* draftTurn(options, again) {
  const spec = options.mcpServers?.featra;
  if (!spec) {
    yield* say("No Featra MCP.");
    yield success("No Featra MCP.");
    return;
  }
  const ids = again ? [...lastDraft.matchAll(/STORY-\d+/g)].map((m) => m[0]) : null;
  const id = `toolu_mcp_${++seq}`;
  const input = draftInput(ids);
  yield assistant(`msg_${++seq}`, [{ type: "tool_use", id, name: "mcp__featra__draft_cards", input }]);
  const result = await callMcpTool(spec, "draft_cards", input);
  lastDraft = result.text;
  yield toolResult(id, result.text, result.isError);
  yield* say(`Tool said: ${result.text}`);
  yield success("Done.");
}

const QUESTIONS = [
  {
    question: "Which colour do you prefer?",
    header: "Colour",
    options: [
      { label: "Blue", description: "Calm" },
      { label: "Red", description: "Loud" },
    ],
    multiSelect: false,
  },
  {
    question: "Which features?",
    header: "Features",
    options: [
      { label: "Search", description: "Find things" },
      { label: "Export", description: "Get data out" },
    ],
    multiSelect: true,
  },
];

/** An AskUserQuestion call, asked through canUseTool as the SDK asks; the tool's result says what the user chose. */
async function* questionTurn(options, signal) {
  const id = `toolu_ask_${++seq}`;
  const input = { questions: QUESTIONS };
  yield assistant(`msg_${++seq}`, [{ type: "tool_use", id, name: "AskUserQuestion", input }]);
  const decision = await options.canUseTool("AskUserQuestion", input, {
    signal,
    toolUseID: id,
    requestId: `request_${seq}`,
  });
  const allowed = decision.behavior === "allow";
  const given = allowed
    ? Object.entries(decision.updatedInput.answers)
        .map(([q, a]) => `"${q}"="${a}"`)
        .join(", ")
    : "";
  yield toolResult(id, allowed ? given : decision.message, !allowed);
  yield* say(allowed ? `Got: ${given}` : "No answer.");
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
      turns += 1;
      sessionModel = String(options.model);
      yield { ...MAIN, type: "system", subtype: "init", session_id: session.id, model: options.model };
      turn = new AbortController();
      if (text.includes("decide")) {
        yield* decideTurn(options);
      } else if (text.includes("draft")) {
        yield* draftTurn(options, text.includes("again"));
      } else if (text.includes("tool")) {
        yield* toolTurn(options, turn.signal, text.includes("twice"));
      } else if (text.includes("question")) {
        yield* questionTurn(options, turn.signal);
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
