/**
 * The scripted turns of fake-agent-sdk.mjs that call one Featra MCP tool the way an agent would: log_decision
 * (STORY-47), draft_cards (STORY-8) and a story's update_card report (STORY-10). The tool calls are real; only the agent
 * is faked. Each takes the SDK fake's message builders as `h`, so the numbering and token use stay in one place.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { callMcpTool } from "./fake-mcp-client.mjs";
import { draftCriteria } from "./fake-agent-evidence.mjs";

/** Calls the Featra MCP's `tool` with `input` as an agent does, and says what it answered. */
async function* callTool(h, spec, tool, input) {
  const { assistant, toolResult, say, success, next } = h;
  const id = `toolu_mcp_${next()}`;
  yield assistant(`msg_${next()}`, [{ type: "tool_use", id, name: `mcp__featra__${tool}`, input }]);
  const result = await callMcpTool(spec, tool, input);
  yield toolResult(id, result.text, result.isError);
  yield* say(`Tool said: ${result.text}`);
  yield success("Done.");
  return result;
}

/** The turn without the Featra MCP (it is off in the project, or the brief names no story). */
async function* noMcp(h) {
  yield* h.say("No Featra MCP.");
  yield h.success("No Featra MCP.");
}

/** Logs a decision through the Featra MCP, when Featra gave it one. */
export async function* decideTurn(h, options) {
  const spec = options.mcpServers?.featra;
  if (!spec) {
    yield* noMcp(h);
    return;
  }
  yield* callTool(h, spec, "log_decision", {
    decision: "Keep entries in the working folder",
    why: "They are committed with the branch.",
    rejected: ["A central log: not versioned with the work"],
  });
}

/** The draft the fake Dev Lead makes; the second call keeps the stories it was given IDs for, with a change. */
const draftInput = (ids) => ({
  feature: { title: "Shaping", description: "Talk a feature through with the Dev Lead, then review it." },
  stories: [
    {
      ...(ids ? { id: ids[0] } : {}),
      title: "Draft a feature",
      story: "As a builder, I get a drafted feature, so that I can review it.",
      criteria: ids ? ["The draft shows in Work", "The draft says Review"] : draftCriteria(),
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

/** Drafts cards through the Featra MCP, when Featra gave it one; `again` redrafts with the IDs the first answer named. */
export async function* draftTurn(h, options, again) {
  const spec = options.mcpServers?.featra;
  if (!spec) {
    yield* noMcp(h);
    return;
  }
  const ids = again ? [...lastDraft.matchAll(/STORY-\d+/g)].map((m) => m[0]) : null;
  const result = yield* callTool(h, spec, "draft_cards", draftInput(ids));
  lastDraft = result.text;
}

/** A story session's first turn, with FEATRA_E2E_REPORT set: reports on the story's card through the Featra MCP. */
export async function* reportTurn(h, options, text) {
  const spec = options.mcpServers?.featra;
  const story = /STORY-\d+/.exec(text)?.[0];
  const feature = /FEAT-\d+/.exec(text)?.[0];
  if (!spec || !story || !feature) {
    yield* noMcp(h);
    return;
  }
  const folder = `.featra/evidence/${feature}/${story}`;
  mkdirSync(join(options.cwd, folder), { recursive: true });
  writeFileSync(join(options.cwd, folder, "draft-shows.txt"), "The draft shows in Work.");
  yield* callTool(h, spec, "update_card", {
    stage: "In Review",
    tasks: ["Write the draft"],
    addTasks: ["Check the draft"],
    criteria: [{ criterion: "The draft shows in Work", evidence: `${folder}/draft-shows.txt` }],
    note: "Drafted and checked.",
  });
}
