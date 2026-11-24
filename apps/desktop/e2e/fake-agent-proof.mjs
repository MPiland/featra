/**
 * The proof turn of fake-agent-sdk.mjs (STORY-25), with FEATRA_E2E_REPORT=proof: a story session lists the page that
 * shows its criterion through the Featra MCP's real update_card tool and moves the story to In Review, where Featra
 * captures that page from the project's dev server. The agent takes no screenshot itself.
 */
import { callMcpTool } from "./fake-mcp-client.mjs";

/** A story session's first turn in the proof run: the page for its criterion, and the move to review. */
export async function* proofTurn(h, options, text) {
  const { assistant, toolResult, say, success, next } = h;
  const spec = options.mcpServers?.featra;
  if (!spec || !/STORY-\d+/.test(text)) {
    yield* say("No Featra MCP.");
    yield success("No Featra MCP.");
    return;
  }
  const input = {
    stage: "In Review",
    criteria: [{ criterion: "The draft shows in Work", page: "/" }],
    note: "Listed the page that shows it.",
  };
  const id = `toolu_mcp_${next()}`;
  yield assistant(`msg_${next()}`, [{ type: "tool_use", id, name: "mcp__featra__update_card", input }]);
  const result = await callMcpTool(spec, "update_card", input);
  yield toolResult(id, result.text, result.isError);
  yield* say(`Tool said: ${result.text}`);
  yield success("Done.");
}
