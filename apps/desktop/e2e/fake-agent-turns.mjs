/**
 * The scripted turns of fake-agent-sdk.mjs that need more than a reply: a background subagent (STORY-55), an
 * AskUserQuestion and a report_bug (STORY-13). Each takes the SDK fake's message builders as `h`, so the numbering and
 * token use stay in one place.
 */
import { callMcpTool } from "./fake-mcp-client.mjs";

const SUB_CALL = "toolu_agent_1";
const SUB_TASK = "task_sub_1";
/** A message of the subagent's own conversation, tagged with the call that started it and its task. */
const inSub = (message) => ({ ...message, parent_tool_use_id: SUB_CALL, agent_id: SUB_TASK });

/** The agent spawns a background subagent; its Bash needs approval (as itself), and it runs until stopTask ends it. */
export async function* subagentTurn(h, options, signal, waitForStop) {
  const { MAIN, assistant, toolResult, say, success, next, seq } = h;
  yield assistant(`msg_${next()}`, [
    { type: "tool_use", id: SUB_CALL, name: "Agent", input: { description: "Review the diff" } },
  ]);
  yield {
    ...MAIN,
    type: "system",
    subtype: "task_started",
    task_id: SUB_TASK,
    tool_use_id: SUB_CALL,
    description: "Review the diff",
    subagent_type: "reviewer",
    task_type: "local_agent",
    is_backgrounded: true,
    prompt: "Review the diff.",
  };
  yield inSub(assistant(`msg_${next()}`, [{ type: "text", text: "Reading the diff." }]));
  const id = `toolu_sub_bash_${next()}`;
  const input = { command: "npm test" };
  yield inSub(assistant(`msg_${next()}`, [{ type: "tool_use", id, name: "Bash", input }]));
  const decision = await options.canUseTool("Bash", input, {
    signal,
    toolUseID: id,
    requestId: `request_${seq()}`,
    agentID: SUB_TASK,
  });
  const allowed = decision.behavior === "allow";
  yield inSub(toolResult(id, allowed ? "ok" : decision.message, !allowed));
  yield inSub(assistant(`msg_${next()}`, [{ type: "text", text: "Tests ran, still reviewing." }]));
  await waitForStop;
  yield { ...MAIN, type: "system", subtype: "task_notification", task_id: SUB_TASK, status: "stopped", summary: "" };
  yield* say("Subagent stopped.");
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
export async function* questionTurn(h, options, signal) {
  const { assistant, toolResult, say, success, next, seq } = h;
  const id = `toolu_ask_${next()}`;
  const input = { questions: QUESTIONS };
  yield assistant(`msg_${next()}`, [{ type: "tool_use", id, name: "AskUserQuestion", input }]);
  const decision = await options.canUseTool("AskUserQuestion", input, {
    signal,
    toolUseID: id,
    requestId: `request_${seq()}`,
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

/** The bug the fake Dev Lead reports: blamed on FEAT-2, so Featra proposes it under that feature while it is started. */
export const REPORTED_BUG = {
  title: "Flaky save",
  description: "Save sometimes shows an error, then works.",
  cause: "FEAT-2",
};

/** Reports a bug through the Featra MCP's report_bug, as the Dev Lead would; the call answers once the user is asked. */
export async function* reportBugTurn(h, options) {
  const { assistant, toolResult, say, success, next } = h;
  const spec = options.mcpServers?.featra;
  if (!spec) {
    yield* say("No Featra MCP.");
    yield success("No Featra MCP.");
    return;
  }
  const id = `toolu_mcp_${next()}`;
  yield assistant(`msg_${next()}`, [{ type: "tool_use", id, name: "mcp__featra__report_bug", input: REPORTED_BUG }]);
  const result = await callMcpTool(spec, "report_bug", REPORTED_BUG);
  yield toolResult(id, result.text, result.isError);
  yield* say(`Tool said: ${result.text}`);
  yield success("Done.");
}
