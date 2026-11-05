// Minimal stdio MCP server for the spike: proves a local server attaches to a session and its tool is callable.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { appendFileSync } from "node:fs";
import { z } from "zod";

const log = process.env.FEATRA_SPIKE_LOG;
const server = new McpServer({ name: "featra-spike", version: "0.0.0" });
server.registerTool(
  "ping",
  { description: "Spike check. Call with any word; returns a fixed token.", inputSchema: { word: z.string() } },
  async ({ word }) => {
    if (log) appendFileSync(log, JSON.stringify({ tool: "ping", word, cwd: process.cwd() }) + "\n");
    return { content: [{ type: "text", text: `pong:${word}:FEATRA-7731` }] };
  },
);
await server.connect(new StdioServerTransport());
