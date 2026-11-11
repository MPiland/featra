# 0028 — Story agents report to the Dev Lead

Date: 2026-11-11 · Status: accepted

## Context

STORY-9 (ADR 0025) starts a story agent as its own Featra session, nested under the chat that spawned it. STORY-53 (ADR 0026) made that session read-only for the user: the Dev Lead steers it. Until now the Dev Lead had no way to learn that a
story's agent finished, failed or asked something, and no way to answer, short of the user relaying it. STORY-54 closes
the loop in both directions.

## Decision

- **The Dev Lead for a story is the chat that spawned it**, the session's `story.parent` (the same scope as `update_card`,
  ADR 0027). A Dev Lead that is gone or closed is not told; a Dev Lead only counts if it is a chat that can run.
- **A notice is app-written text, not a model call.** When a story session ends a turn, the user stops it, or it fails,
  Featra posts one short message in the Dev Lead's chat: `STORY-N ended|stopped|failed: <last of what it said>`, one line
  of at most 160 characters. The text is pure (`story-notice.ts` in work-format), so it costs the story nothing and the
  Dev Lead only the tokens of reading it.
- **A notice is a user-role message, labelled.** It opens with `[Featra notice, written by the app, not the user]`, so
  the Dev Lead's agent, and the user reading the chat, can tell Featra from the user. It is delivered through the chat's
  normal send, so the Dev Lead's agent hears it and may answer it.
- **Notices wait for a busy Dev Lead and go together.** If the Dev Lead is mid-turn, notices queue per Dev Lead and are
  sent as one message, one line each, when its turn ends. A burst of stories ending is one turn, not one each.
- **A story's question goes to the Dev Lead, not the user.** The question is the provider's own `AskUserQuestion`. The
  call is refused with a message that tells the session its question went to the Dev Lead and to end its turn; the turn
  then ends naturally and the notice is `STORY-N asks: <question>`, with a hint on how to answer. The refusal does not
  interrupt the turn, so the session keeps its place in the same provider session. With no Dev Lead to tell, the question
  keeps its old path: the user is asked in the session's chat and the Inbox.
- **`message_session(story, text)` answers or steers.** A new agent-socket method `session.message` and MCP tool. The text
  goes to the story's session as its next turn, labelled `Message from the Dev Lead:`, in the same provider session (a
  live agent hears it; one whose process has gone is started again). It is refused: from any chat but the one that spawned
  the story (including a story session), while the session is working or waiting for a slot (the next notice says when it
  is idle), when the card is gone or no story, and **when the story is Stopped**.
- **A Stopped story is not messaged.** Stop is the user's act (ADR 0026), so only the user's Resume goes on. The refusal
  is "STORY-N is stopped. Only the user can resume it." and the story stays Stopped.
- **The user's Stop is a notice too**, and so is a queued story the user took off the queue before it started (no turn will
  end to say so): `stopped: Taken off the queue before it started.`

## Review rulings

- **A story's question that the Dev Lead is gone for goes to the user.** The notice holds every question the turn asked,
  each with its option labels, up to 600 characters; other notices stay at 160. If the Dev Lead is gone or closed by the
  end of the turn, the held question asks the user in the story's chat (the no-Dev-Lead path), and the answer is sent to
  the session as a message.
- **A Dev Lead whose own turn the user stopped holds its notices** and gets them when its next turn that is not a stop
  ends: Stop is not the time to put more in front of it.
- **A story that waited for a slot and could not start posts a `failed` notice** with the reason.
- **Delivery errors drop notices only when they can never succeed** (the Dev Lead is closed or can't take a message); a
  transient error keeps them for the next idle. A chat that ends forgets the notices and questions it held.
- **`message_session` and Resume don't race.** Each claims the session's next turn before it sends (`chat-send.ts`), so
  one is refused as busy and a turn never starts with two messages.
- **`message_session` is gated only by the MCP's off switch,** not the knowledge setting: it writes no card or knowledge
  file, and a read-only project withholds the whole MCP.
- **No live Dev Lead: no completion, stop or failure notice is shown anywhere for now;** questions still reach the user.
  Notices held in memory are lost across a restart. Both are on the roadmap, with a per-story notice budget.

## Consequences

- No new provider interface: the notice rides the existing send, and the question the existing permission callback.
- A restored story session that was not opened can be messaged: it is opened first and goes on in its saved provider
  session (proved by a restart test).
