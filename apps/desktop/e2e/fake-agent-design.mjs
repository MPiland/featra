/**
 * The design review turns of fake-agent-sdk.mjs (STORY-73), through the Featra MCP's real update_card tool; only the
 * agent is faked.
 *
 * - With FEATRA_E2E_REPORT=design, a story session's first turn lists the page "/" for its criterion and moves the story
 *   to In Review, where Featra captures it; then it tries to move the story on to Acceptance. With
 *   FEATRA_E2E_REPORT=design-plain it attaches a text file instead of listing a page, so the story has no screenshots.
 * - "design findings STORY-N: <findings>": the Dev Lead records the findings on STORY-N's design review.
 * - "design clear STORY-N": the Dev Lead clears STORY-N's design review and moves it to Acceptance, in one call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { callMcpTool } from "./fake-mcp-client.mjs";

/** Calls update_card with `input` as an agent does; what it answered. */
async function* update(h, spec, input) {
  const id = `toolu_mcp_${h.next()}`;
  yield h.assistant(`msg_${h.next()}`, [{ type: "tool_use", id, name: "mcp__featra__update_card", input }]);
  const result = await callMcpTool(spec, "update_card", input);
  yield h.toolResult(id, result.text, result.isError);
  return result;
}

async function* noMcp(h) {
  yield* h.say("No Featra MCP.");
  yield h.success("No Featra MCP.");
}

/** A story session's first turn: its criterion's proof and the move to review, then the move on to Acceptance. */
export async function* designStoryTurn(h, options, text) {
  const spec = options.mcpServers?.featra;
  const story = /STORY-\d+/.exec(text)?.[0];
  const feature = /FEAT-\d+/.exec(text)?.[0];
  if (!spec || !story || !feature) {
    yield* noMcp(h);
    return;
  }
  let criterion = { criterion: "The draft shows in Work", page: "/" };
  if (process.env.FEATRA_E2E_REPORT === "design-plain") {
    const folder = `.featra/evidence/${feature}/${story}`;
    mkdirSync(join(options.cwd, folder), { recursive: true });
    writeFileSync(join(options.cwd, folder, "draft-shows.txt"), "The draft shows in Work.");
    criterion = { criterion: "The draft shows in Work", evidence: `${folder}/draft-shows.txt` };
  }
  const moved = yield* update(h, spec, { stage: "In Review", criteria: [criterion], note: "Ready for review." });
  const on = yield* update(h, spec, { stage: "Acceptance" });
  yield* h.say(`Tool said: ${moved.text} Then: ${on.text}`);
  yield h.success("Done.");
}

/** The Dev Lead's design review of the story the message names: its findings, or the clear and the move on. */
export async function* designLeadTurn(h, options, text) {
  const spec = options.mcpServers?.featra;
  const card = /STORY-\d+/.exec(text)?.[0];
  if (!spec || !card) {
    yield* noMcp(h);
    return;
  }
  const input = text.includes("design clear")
    ? { card, designReview: { clear: true }, stage: "Acceptance" }
    : { card, designReview: { findings: text.slice(text.indexOf(":") + 1).trim() } };
  const result = yield* update(h, spec, input);
  yield* h.say(`Tool said: ${result.text}`);
  yield h.success("Done.");
}
