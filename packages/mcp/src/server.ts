import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { errorMessage } from "@featra/work-format";
import { ToolRefusal, TOOLS, type FeatraHost, type Tool } from "./tools.ts";

/** The server's name and version as an MCP client sees them. */
export const SERVER_INFO = { name: "featra", version: "0.0.0" } as const;

/** The MCP server over `tools` and `host`; connect it to a transport (stdio in the app). */
export function createMcpServer(host: FeatraHost, tools: readonly Tool[] = TOOLS): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const tool = tools.find((t) => t.name === params.name);
    if (!tool) return reply(`No such tool: ${params.name}.`, true);
    try {
      return reply(await tool.run(params.arguments, host), false);
    } catch (err) {
      // A refusal is the agent's to fix; anything else (the server gone) is told plainly and is not retried here.
      return reply(
        err instanceof ToolRefusal ? err.message : `${tool.failed ?? "Not logged."} ${errorMessage(err)}`,
        true,
      );
    }
  });

  return server;
}

const reply = (text: string, isError: boolean) => ({ content: [{ type: "text" as const, text }], isError });
