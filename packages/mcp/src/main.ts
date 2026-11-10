/** The Featra MCP process (STORY-47): an agent starts this over stdio; it reaches Featra's server with its chat's secret. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connectAgent } from "./agent-client.ts";
import { createMcpServer } from "./server.ts";

async function main(): Promise<void> {
  const url = process.env.FEATRA_AGENT_URL;
  const token = process.env.FEATRA_AGENT_TOKEN;
  if (!url || !token) throw new Error("FEATRA_AGENT_URL and FEATRA_AGENT_TOKEN are required.");
  const agent = await connectAgent(url, token);
  const server = createMcpServer(agent);
  // oxlint-disable-next-line unicorn/prefer-add-event-listener
  server.onclose = () => agent.close();
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  process.stderr.write(`Featra MCP: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
