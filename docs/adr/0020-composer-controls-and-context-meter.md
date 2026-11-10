# 0020 — Composer controls and the context meter

Date: 2026-11-09 · Status: accepted

## Context

STORY-22 lets the user change a chat's role, model, effort and permission mode from the composer, and shows how much of
the model's context window the chat uses. Featra supports Claude now and Codex in M2 (ADR 0018), so neither the
controls nor the meter may name one provider. Providers differ in what they can change mid-session and in what they
report: Claude's Agent SDK sends `usage` on each assistant message and `modelUsage` (with `contextWindow`) on each
result; Codex sends `token_count` events. The meter must spend no tokens, so it reads only what the session already
emits.

## Decision

**The adapter lists the controls; the composer shows them.** `ProviderAdapter.controls(role)` returns the models,
effort levels and permission modes the provider offers, under the provider's own names (`ChatControls` in
`work-format/chat-controls`), and `settings(role)` returns what a role starts with. An empty list means the provider has
no such control and the composer hides it. Claude labels its `default` mode "default (Ask)". Full access
(`bypassPermissions`) is offered only to a chat that already started in it, never as a switch up.

**A change applies from the next turn, by restarting the agent.** `chat.configure` stores the new role and settings on
the chat and its provider session (`configure`). A running turn is left alone. On the next send, if the settings differ
from the ones the running agent started with, the Claude adapter closes that agent quietly and starts the next one with
`resume` set to the session id, so the conversation goes on with the new options. Changing the model or effort needs
this because the SDK takes them at start. The server checks each value against the adapter's controls and refuses what
isn't offered. A role change takes the new role's prompt, model, effort and mode, then applies the user's other choices
from the same change over them; a role of another provider is refused.

**`chat.controls` and `chat.configure` are separate methods.** Settings are not in the event log, so `chat.watch`'s
snapshot is unchanged.

**Usage comes from the session's own events, as a neutral `usage` event.** `{ used, window }`, emitted before
`turn-end`. For Claude, `used` is the sum of the input, cache read, cache creation and output tokens of the turn's last
main-thread assistant message (a subagent's messages are not the chat's context). `window` is the `contextWindow` of
the `modelUsage` entry named like the init message's model, else the only entry, else null: Featra never guesses. A
Codex adapter maps `token_count` (with its model context window) to the same event. A restored chat reads `usage` from
its session's messages, without a window. The meter shows "used / window tokens" with a bar, or "used tokens" alone
when the window is null, and is hidden until the first usage.

## Consequences

- No extra turn, probe or request is made to learn usage (the tests feed the agent only the user's messages).
- A new provider supplies `controls`, `settings`, `configure` and `usage` events and gets the composer and meter.
- A change costs an agent restart on the next turn, which re-reads the session; a changed chat may start slower.
- Settings changed in the composer are held while the server runs; a restored chat starts from its role (open question).
