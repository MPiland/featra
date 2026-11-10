# 0019 — The Featra MCP reaches the server over a narrow agent socket, with a secret per chat

Date: 2026-11-09 · Status: accepted

## Context

ADR 0006 puts the Featra MCP in every session, and ADR 0010 has agents act through it. STORY-47 is its first use: an
agent logs a decision or an open question. The MCP is a stdio process the agent's own host starts, so it is outside
Featra's process tree of trust: whatever the agent can run, it can run too. The server writes the files (ADR 0012) and
already has one socket, the window's, whose token opens every method, `chat.approve` among them.

Options for the MCP's way in:

1. Give the MCP the window's token. Simple, but an agent could then call `chat.approve` and allow its own tools, or
   read any project the user opened.
2. Let the MCP write the files itself. It would need the project folder and would bypass the server's queue, the
   ledger Undo relies on, and the chat's event log.
3. A second, narrow socket on the same server, with a secret the server mints for each chat.

## Decision

**Option 3.** The server listens for agents on `/v1/agent` beside the window's `/v1`.

- **A secret per chat.** When a chat's agent starts, the server mints a random secret for that chat and gives it to the
  MCP process in its environment (`FEATRA_AGENT_TOKEN`), with the socket's address (`FEATRA_AGENT_URL`). The window's
  token is never given to an agent. The secret ends with the chat.
- **The chat comes from the secret, never from the request.** Whatever an agent sends, it acts on its own chat: its
  working folder, its session name, its event log.
- **One method.** `log.append`, with the entry's input checked by the same `work-format` parser the tool uses. A
  secret does not open the window's path, and the window's token does not open the agent path, so an agent cannot call
  any other method.
- **The provider neutral seam.** `provider.ts` carries a `McpServerSpec` (name, command, args, env) in the session
  options, built by the agent bridge (`agent-bridge.ts`). The Claude adapter turns it into `mcpServers` and an
  `allowedTools` rule for the server's own tools, so the agent is never asked to approve them. A Codex or ACP adapter
  maps the same spec to its own config. ADR 0018's "Featra passes no allow lists" is amended for this one rule: it
  covers Featra's own server's tools only.
- **The server stays the only writer.** `log-writer.ts` appends in a per-file queue, writes atomically (temp file and
  rename), and remembers each entry it wrote. A hidden `<!-- featra:ID -->` marker names the entry in the file. Undo
  removes that entry's lines only, refuses when the user has edited them, and quietly succeeds when they are already
  gone.
- **A process of its own.** `packages/mcp` is bundled to `dist/mcp.cjs` and run with Electron's own Node, as the server
  is (ADR 0015). It is a thin bridge: the MCP SDK's server over stdio, a tool registry, and a WebSocket client.
- **Settings.** The MCP is on unless the project's `mcp` or, failing that, the app default says otherwise. The server
  reads the project's `.featra/config.yaml` and the app's `settings.json` (read only) each time an agent starts, so a
  change applies to the next chat.

## Consequences

- An agent that is compromised can log text into its own chat's project files, which the user sees and can undo, and
  nothing else. It cannot approve, send, read or write through the window's methods.
- Another tool (FEAT-4's `draft_cards`) is one more entry in the MCP's registry and one more method on the agent
  socket, with its own parser and a scope check; no new transport.
- Undo works while the server runs: the ledger is in memory, so after a restart Undo of an older entry says it is
  already removed. The entry stays in the file for the user to edit.
- A logged row is shown live; it is not restored into a chat's history after a restart (the saved transcript is the
  agent's own, which has the tool call but not Featra's row).
- Packaging must check that the forked `mcp.cjs` runs from the asar, as for `server.cjs` (STORY-2).
