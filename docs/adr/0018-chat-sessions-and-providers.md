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
  `"reply"`, `"approval"` (STORY-45) or `"question"` (STORY-46), the last two being the `AskReason`s. The server keeps a row's open
  requests beside it (`ChatRow.asks`, `reduceRow`): the oldest open request sets `waiting`, and once the last one is
  answered the turn goes on and waits on nothing. Only the row is listed and saved; a saved or restored row never
  waits on a request (`idleSummary`), since no request outlives its agent.
- **Role registry** (`role-registry.ts`): the built-in roles come from `work-format/roles`; STORY-6 adds the project's
  own roles behind the same `list`/`get`.
- **Approval handler**: every tool the agent must ask about goes to an `ApprovalHandler`. By default it is the
  approval desk (`approval-desk.ts`, STORY-45), which tells the chat `approval` and holds the request until the user
  answers through `chat.approve`. See "Tool approvals" below.
- **Question handler** (STORY-46): when the agent asks the user to choose, the adapter calls the session's `ask`
  (a `QuestionHandler`), which the desk implements beside `approve`. See "Agent questions" below.
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

**Tool approvals (STORY-45).** In Ask, the SDK calls `canUseTool` for a tool the user's Claude settings don't already
allow; the adapter passes it to the handler with the SDK's abort signal and `forChat` (false when the SDK sets
`suppressAlwaysAllowRule`). The desk answers:

- **Allow** allows this call (`tool-allowed`, scope `once`). **Deny** denies it with `denyMessage(reason)`, so the
  agent is told the user's optional reason (trimmed, at most 500 characters), and the row shows Denied with the reason.
- **Allow for this chat** (decided by the user, 2026-11-09) uses the provider's own rule first. A provider may
  suggest a rule for a request, an optional adapter capability (`ToolRequest.suggested`: an opaque `rule` and a short
  `covers` line). Allow for this chat then hands the rule back through the decision (`ToolDecision.rule`) and the
  provider applies it for its session and matches later calls itself; they never reach the desk. Claude's adapter
  (`claude-rules.ts`) keeps only the `addRules` allow updates among the SDK's `suggestions`, sends them back unchanged
  as `updatedPermissions` but with `destination: "session"` (Bash suggestions name `localSettings`), and drops mode
  and directory updates, so nothing is written to the user's Claude settings. Codex and later providers fill in
  `suggested` when they come; nothing Claude-specific is in shared code.
- Without a suggestion, Featra's own rule (`chatRule` in `work-format/chat-rules`), kept in the server's memory per
  chat: a shell tool (Bash, PowerShell) by its whole input except `description`, `timeout` and `run_in_background`,
  so a field that changes how it runs (`dangerouslyDisableSandbox`, or one the SDK adds later) asks again; Write and
  Edit for paths whose real path (links resolved by the server, through a resolver work-format takes) is inside the
  chat's working folder's and outside `.git` and `.claude`, with a path that can't be resolved or has `..` treated as
  outside; WebFetch by
  domain; an MCP tool by name. Any other call has no rule and isn't offered Allow for this chat. A later matching
  call is allowed without asking and shows "Allowed for this chat" (scope `chat`).
- The `approval` event says what Allow for this chat covers in a short line built from the rule (`covers`: "npm test
  commands", "Edits in this folder"), shown as the button's description. It is offered only for a call with
  `forChat: true` (false when the SDK sets `suppressAlwaysAllowRule`) and a rule, and never once the turn is stopped:
  the desk checks the turn's signal before its rules.
- **Unanswered.** Stop aborts the turn; the SDK's signal cancels the request (`approval-cancelled`), the agent is
  told `APPROVAL_CANCELLED` with `interrupt: true` so it stops rather than try another step, and the row shows
  Stopped. The agent failing aborts the turn first, so nothing is left waiting. The same call asked again replaces
  the first request, which ends with `APPROVAL_CANCELLED`. The SDK cancelling a request on its own shows Cancelled.
  Closing the chat or its project ends its requests quietly and forgets its rules. After a restart a call with no
  result in a finished turn shows Cancelled, never Denied, and the chat waits on a reply.
- `chat.approve` refuses an answer to a request that isn't waiting (`noRequest`) and Allow for this chat on a
  once-only call (`onceOnly`). The rules and the answer's params are in `work-format/approvals`, shared by server and
  client.

**Agent questions (STORY-46).** Claude's AskUserQuestion reaches `canUseTool` like any tool that needs approval
(docs/spike-claude-sdk.md#ask). `claude-question.ts` is the only Claude-specific part: it reads the call's questions,
and turns the user's answers into `updatedInput.answers` (each question's text to the chosen labels joined with a
comma and a space, Claude's format, so a comma inside a label is ambiguous to the agent), which Claude hands the agent
as the tool's result, so the same turn goes on. A call whose questions Featra can't show (none, a blank option, two
questions with one text, two options with one label) is denied at once, without asking the user, with a message telling
the agent to ask again. Allowing it would run the tool with no answers. The provider seam is neutral: a
`QuestionRequest` of `Question`s (`work-format/questions`: text, header, options, `multiSelect`), answered with
`Answers` (question text to the chosen labels or the user's own words), or refused. The desk holds a question like an
approval (one `hold` for both), tells the chat `question`, and `chat.answer` settles it with `question-answered`; it
takes only answers that answer each question as it asks (`validAnswers`: one for a single choice, one or more for
several), else the question keeps waiting (`badAnswer`). Stop, the SDK cancelling and the chat closing end it as an
unanswered approval does (`approval-cancelled`, the same agent message), and the card shows as the stopped or cancelled
call. The question shows on its call's own row (`ChatItem.question`), so no new item kind.

**Stop.** Stop only marks a turn that is running. Before the agent has started, Stop ends the turn as stopped and the
next message starts afresh; after the turn has ended, Stop does nothing. A tool request that Stop or closing cut short
shows as stopped, not Denied. A project the user closes ends its chats, and their events are no longer pushed.

**Chats survive a restart (STORY-44).** The manager saves each chat's project, session id and row (title, role,
provider, start, waiting) to `chats.json` in the app's data folder (Electron's userData, passed to the server as
`FEATRA_DATA_DIR`), never in the repo; `work-format/chat-saved` reads it defensively. It saves on each row or session
change, through the atomic `json-store`, and the first save waits for the file to be read, so it never drops a chat
not yet loaded (`chat-store.ts`). A missing file is no chats; one that isn't JSON is kept as `chats.json.bad`; any
other read failure (locked, no access) is logged and nothing is saved over the file that run. A new session id is saved
once the agent answers (text or a tool), since Claude may not have written the session before then; a chat stopped or
crashed earlier comes back as a fresh chat. Project folders compare by `projectKey` (`allowed-projects.ts`), without
case on Windows and macOS. Restored chats are listed at once but loaded lazily: `open(id)` reads the transcript through the
adapter and makes the agent session with `resume`; the agent itself starts with the next message. A chat whose
session the provider no longer has gets a `gone` problem ("This chat's history is gone."), refuses messages, and the
client offers a new chat with the same role. A closed project's chats are kept and saved, out of the list, and come
back when the project opens again. Without a data folder (tests), chats last until the server exits.

**The SDK stays out of the bundle.** It is loaded with a dynamic `import()` when the first agent starts, and the
desktop build marks it external, so it is resolved from the app's own dependencies. E2E runs point
`FEATRA_E2E_AGENT_SDK` at a module that fakes `query` (ADR 0013).

**Events, not view state, on the wire.** `work-format/chat-events` defines the events (`user`, `started`, `text`,
`tool`, `approval`, `tool-allowed`, `tool-denied`, `question`, `question-answered`, `approval-cancelled`, `tool-result`, `problem`, `turn-end`) and
`work-format/chat` folds them into what the view shows. The server keeps the log; the client folds it, so a reconnect gets the whole chat again.

**Protocol additions (ADR 0015).**

| Method         | Params                          | Result                                                                        |
| -------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `chat.roles`   | `{ dir }`                       | The roles a chat in the project can start from                                |
| `chat.start`   | `{ dir, role }`                 | `{ id }`: the chat, not yet running                                           |
| `chat.watch`   | `{ id }`                        | `{ events }`, the log so far; then a `chat.event` push for each new event     |
| `chat.send`    | `{ id, text }`                  | `null`, or refused while a turn runs                                          |
| `chat.stop`    | `{ id }`                        | `null`: interrupts the running turn                                           |
| `chat.approve` | `{ id, tool, choice, reason? }` | `null`; `choice` is `allow`, `allow-chat` or `deny`; `reason` only for `deny` |
| `chat.answer`  | `{ id, tool, answers }`         | `null`; `answers` maps each question's text to the labels or own words chosen |
| `chat.list`    | `{ dir }`                       | `{ providers, chats }`; then a `chat.list` push each time the list changes    |

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

## STORY-6 note: roles from files

Roles are listed by a registry over `.featra/roles/` and one reader per provider (`.claude/agents`, `.codex/agents`,
project and user), read live. The registry hands the chat manager a role with the model Claude can run and the mode the
provider's own settings name; the manager passes it to the provider adapter unchanged. A new provider adds a reader and
an adapter, nothing else.
