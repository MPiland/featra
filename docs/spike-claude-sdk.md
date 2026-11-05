# Spike: Claude Agent SDK (PBI-1)

Run 2026-11-04 on Windows 11 with `@anthropic-ai/claude-agent-sdk` 0.3.318 and the user's installed Claude Code
2.1.301 (`C:\Users\<user>\.local\bin\claude.exe`). Script: `spikes/claude-sdk/spike.mjs`; raw results:
`spikes/claude-sdk/results.json`. Cost was about $0.17 of subscription usage: session A (Haiku) $0.008, session B (Sonnet) $0.164.

**Verdict:** the SDK does everything M1 needs. Build the Claude provider on it, pointed at the user's own `claude`.

## Login {#login}

**Pass.**
- Like T3 Code, Featra passes `pathToClaudeCodeExecutable` set to the user's installed `claude`, so the CLI's own
  login is used.
- The spike removes `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the session environment.
- Featra reads no credential file.
- The init message reported `apiKeySource: "none"`, and the sessions still succeeded on the user's CLI login.

**Policy note.** The SDK overview says third-party developers may not "offer claude.ai login … including agents built
on the Claude Agent SDK" unless approved.
- Featra never offers a login: the user signs in with Anthropic's own CLI, which Featra launches. T3 Code ships the same
  pattern.
- This is still a grey area, and Anthropic could tighten enforcement later.
- An optional API-key provider goes on the roadmap as a fallback.

## AskUserQuestion interception {#ask}

**Pass.**
- `canUseTool("AskUserQuestion", input)` fired with `input.questions[]`.
- Returning `{ behavior: "allow", updatedInput: { ...input, answers: { [questionText]: "Blue" } } }` delivered the
  answer. The agent received the tool result `"Which colour do you prefer?"="Blue"` and replied "Blue".
- Answers are keyed by question text, not by header.
- **Correction to the record.** The first run's check also required the reply in capitals, so `results.json` shows
  `ask: FAIL`. That check tested the model's instruction-following, not the acceptance criterion.
  - The script now checks the tool result the agent received.
  - Re-evaluating the corrected check against the saved transcript passes.

## Model and effort per session {#model}

**Pass.**
- Session A ran with `model: "haiku", effort: "low"` and reported `claude-haiku-5-5`.
- Session B ran with `model: "sonnet", effort: "high"` and reported `claude-sonnet-5-5`.
- `effort` is accepted per query (`low | medium | high | xhigh | max`). The init message doesn't echo it back, so
  Featra must record the requested effort itself, on the card's `reasoning` field.

## Local stdio MCP {#mcp}

**Pass.**
- The setting `mcpServers.featra = { type: "stdio", command: node, args: [mcp-server.mjs] }` worked: the server was
  `connected` at init.
- The agent called `mcp__featra__ping` and got the server's token back.
- **`canUseTool` is asked for MCP tools too** when they are not in `allowedTools`: it saw `mcp__featra__ping` and then
  `Write`. This settles an ambiguity in the docs.
  - Featra can auto-allow its own `mcp__featra__*` tools with `allowedTools`.
  - Everything else goes through Featra's approval UI.

## Worktree as working directory {#cwd}

**Pass.**
- The setting `cwd` was a real `git worktree` (branch `feat/1-pbi-1`), and the init message's `cwd` matched it.
- The agent's `Write` created `proof.txt` in the worktree and not in the main checkout.
- The MCP server process also started with the worktree as its cwd.

## Findings that change the design

1. **The user's claude.ai connectors attach even with `settingSources: []`.** Init listed "claude.ai Claude Docs",
   Google Drive and Figma, some of them `needs-auth`.
   - Sessions therefore see the user's own connectors.
   - That is acceptable, since they are the user's tools, but the session view should show which servers are
     attached.
2. **`settingSources` defaults to user, project and local.** That means CLAUDE.md, settings, hooks and skills load.
   - Featra should keep that default. Agent instruction files are user-owned, and sessions should behave like the
     user's normal `claude`.
   - The spike used `[]` only to isolate the checks.
3. **MCP status can be `pending` at init.** Use `query.mcpServerStatus()` for live status.
4. **Windows:** `where claude` returns the native `.exe`, and the SDK spawned it without a shell. On macOS and Linux,
   use `which`.
