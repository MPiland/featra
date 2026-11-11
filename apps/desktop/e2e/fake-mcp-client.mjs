import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** Calls one tool of an MCP server over stdio (newline-delimited JSON-RPC), as an agent's host does. */
export async function callMcpTool(spec, name, args) {
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
