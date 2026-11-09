# 0018 — Chats: a session manager in the server, behind provider adapters

Date: 2026-11-08 · Status: accepted

## Context

STORY-5 starts a chat from a role and streams it. ADR 0007 has Featra drive the user's own `claude` through the Agent
SDK, and ADR 0012 puts long-running work in the local server, not the renderer or Electron's main process. Later
stories add approvals (STORY-45), questions as cards (STORY-46), user roles (STORY-6), chats that survive a restart
(STORY-44) and, in M2, other agents (Codex, ACP). The first chat must leave room for all of them without building them.

## Decision

**Session manager in `packages/server`.** `chat-manager.ts` owns the chats: it starts one from a role in a project the
user opened, keeps each chat's event log in memory, fans new events out to watchers, and passes sends and stops to the
chat's provider session. One message at a time: a send while a turn is running is refused ("Wait for the reply, or
stop it.").

**Seams.**

- **Provider adapter** (`provider.ts`): `ProviderAdapter.start(options)` returns a `ProviderSession` with `send`,
  `interrupt` and `close`, and reports `ChatEvent`s. Claude (`claude-provider.ts`) is the only adapter in M1.
  Each adapter also has a display `name` and `installed()` (for Claude, `claude` is on the PATH); the chat list groups
  by them, so no part of the list names a provider itself (STORY-21). `chat.list` looks again on each push, so a
  provider installed while the app runs shows with the next change to the list.
- **Chat list** (STORY-21): the manager keeps a row per chat (`ChatSummary` in `work-format/chat-list`), folded from
  the same events as the log, and pushes the project's list when a row changes (not for each streamed delta). A chat
  waits on the user (`waiting`) when its turn ended done or failed, not stopped; a message clears it. `WaitReason` is
  `"reply"` today; STORY-45 adds a tool approval and STORY-46 a question, each set from its own event.
- **Role registry** (`role-registry.ts`): the built-in roles come from `work-format/roles`; STORY-6 adds the project's
  own roles behind the same `list`/`get`.
- **Approval handler**: every tool the agent must ask about goes to an `ApprovalHandler`. Until STORY-45 it is
  `denyUntilApprovals`, which denies with a message the agent and the user both see, and the chat marks the row Denied.
  The handler gets an abort signal; a request it answers after Stop or close is not marked Denied.
- **Session id**: the adapter reports the SDK's session id on `started`, and the manager saves it with the chat.
  `start({ resume })` goes on in that session (the SDK's `resume` option), so a restored chat keeps its context.
- **History** (STORY-44): `ProviderAdapter.history(session, cwd)` gives a session's transcript as chat events, or
  null when the provider no longer has it. Claude's adapter reads it with the SDK's own reader (`getSessionInfo`,
  `getSessionMessages`, `claude-transcript.ts`), so Featra never parses Claude's file format or locates its files;
  reading runs no agent and costs no tokens. Each prompt opens a turn, closed as done before the next one; subagent
  messages stay out, as they do live. Nothing Claude-specific is in the manager.

**The Claude adapter.** The agent starts on the chat's first message, with `pathToClaudeCodeExecutable` set to the
`claude` found on the PATH (`claude-locate.ts`; on Windows the `.exe`, or an npm shim's script), `cwd` the project,
the role's model and effort, the role prompt appended to the `claude_code` preset, `permissionMode: "default"` (Ask)
and partial messages on. `settingSources` is left at the SDK's default, so the user's CLAUDE.md, skills and hooks still
apply. The environment is Featra's minus `ELECTRON_RUN_AS_NODE`. `claude-messages.ts` translates the SDK's messages
into chat events; subagent messages are left out. A missing `claude` is reported before the SDK is loaded; logged out
is read only from the SDK's `error: "authentication_failed"`, never from a file or from what the agent's text says.

**What Ask means.** The user's own Claude permission rules (allow and deny, and a settings `defaultMode`) apply before
`canUseTool`, so Ask means "ask for anything your Claude settings don't already allow". Featra passes no allow or deny
lists, no permission prompt tool and no settings of its own, so it never bypasses `canUseTool`.

**Stop.** Stop only marks a turn that is running. Before the agent has started, Stop ends the turn as stopped and the
next message starts afresh; after the turn has ended, Stop does nothing. A tool request that Stop or closing cut short
shows as stopped, not Denied. A project the user closes ends its chats, and their events are no longer pushed.

**Chats survive a restart (STORY-44).** The manager saves each chat's project, session id and row (title, role,
provider, start, waiting) to `chats.json` in the app's data folder (Electron's userData, passed to the server as
`FEATRA_DATA_DIR`), never in the repo; `work-format/chat-saved` reads it defensively. It saves on each row or session
change, through the atomic `json-store`, and the first save waits for the file to be read, so it never drops a chat
not yet loaded. Restored chats are listed at once but loaded lazily: `open(id)` reads the transcript through the
adapter and makes the agent session with `resume`; the agent itself starts with the next message. A chat whose
session the provider no longer has gets a `gone` problem ("This chat's history is gone."), refuses messages, and the
client offers a new chat with the same role. A closed project's chats are kept and saved, out of the list, and come
back when the project opens again. Without a data folder (tests), chats last until the server exits.

**The SDK stays out of the bundle.** It is loaded with a dynamic `import()` when the first agent starts, and the
desktop build marks it external, so it is resolved from the app's own dependencies. E2E runs point
`FEATRA_E2E_AGENT_SDK` at a module that fakes `query` (ADR 0013).

**Events, not view state, on the wire.** `work-format/chat-events` defines the events (`user`, `started`, `text`,
`tool`, `tool-denied`, `tool-result`, `problem`, `turn-end`) and `work-format/chat` folds them into what the view
shows. The server keeps the log; the client folds it, so a reconnect gets the whole chat again.

**Protocol additions (ADR 0015).**

| Method       | Params          | Result                                                                     |
| ------------ | --------------- | -------------------------------------------------------------------------- |
| `chat.roles` | `{ dir }`       | The roles a chat in the project can start from                             |
| `chat.start` | `{ dir, role }` | `{ id }`: the chat, not yet running                                        |
| `chat.watch` | `{ id }`        | `{ events }`, the log so far; then a `chat.event` push for each new event  |
| `chat.send`  | `{ id, text }`  | `null`, or refused while a turn runs                                       |
| `chat.stop`  | `{ id }`        | `null`: interrupts the running turn                                        |
| `chat.list`  | `{ dir }`       | `{ providers, chats }`; then a `chat.list` push each time the list changes |

`chat.watch` and `chat.send` open the chat first, so a restored chat's transcript is read on its first watch.
`chat.watch` and `chat.list` stop on `work.unwatch` or when the socket closes, like `work.watch`. A push can arrive
before the watch's answer; the client keeps it and applies it after the log.

## Consequences

- The renderer never touches the SDK or a process; a crashed server ends its chats, and the client shows the failure.
- Chats survive a restart (STORY-44). The transcript stays in the provider's own session: Featra keeps only what it
  needs to list a chat and go on with it, and a chat whose session was deleted says so rather than failing.
- The session reader is the SDK's, not a fake, in every test; tests and E2E point `CLAUDE_CONFIG_DIR` at a folder of
  their own and write session files there as Claude does.
- A new provider is one adapter: the manager, protocol and view stay as they are.
- **Licence.** The Agent SDK is not MIT; ADR 0007 accepted it as a dependency.
- **Limit.** Until STORY-45, a tool that needs approval is always denied.
