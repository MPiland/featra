# 0021 — Agents draft cards through the Featra MCP, and a later call updates the draft in place

Date: 2026-11-10 · Status: accepted

## Context

FEAT-4 (Shaping) has the Dev Lead talk a feature through with the user and leave it as cards the user reviews. STORY-8
is the first slice: the agent's `draft_cards` call. ADR 0002 makes main own a draft and the server allocate IDs, ADR
0019 gives the MCP a narrow agent socket whose chat comes from a secret, and ADR 0010 has agents act through the MCP.
Later stories (49 to 51) review, send back, approve or reject the draft, so this one has to record where a draft came
from and how it changes.

## Decision

- **One method on the agent socket, `cards.draft`, behind one tool, `draft_cards`.** The input is checked by
  `parseDraft` in `work-format` (the same parser the tool uses), and a draft that fails writes nothing and says why.
  The tool description teaches the card format; Featra still injects no prompt.
- **A draft is written by the server, to main's checkout, uncommitted.** `planDraft` is pure: it takes every card of
  the project and returns the cards to write. IDs come from `nextId` over all owner cards, the one allocator. Every card
  write goes through one lane in the server (drafts and card-pane edits), so two chats drafting at once get different
  IDs. A call changes every card or none: owners are resolved and old files read before the first write, and a failure
  restores them and removes the new ones. New files are created exclusively and an ID already on disk is allocated
  again. A second app instance on the same project is not covered.
- **The chat that drafted a feature is recorded on the feature** as the frontmatter key `drafted-by` (kept in
  `card.extra`, which already round-trips unknown keys). STORY-49 opens that chat from it. A feature waits for review
  when its status is `draft` and it has `drafted-by`; the Work list row carries `review` and `draftedBy`.
- **One open draft per chat.** A call from a chat with no open draft makes a Draft feature and its stories; a call from
  a chat that has one revises it in place, keeping the feature, the files and the IDs. A story is kept by giving its
  `id` (from the answer), a story without one is new, and a story left out is Cancelled, never deleted, so history
  keeps it. An `id` the draft doesn't have is refused. Only stories still in the first stage can be left out or changed; a started
  story must be sent unchanged, and the call is refused whole otherwise. Once the feature has left `draft`, a call from
  its chat is refused and no second feature is made. A revision is also refused when the user edited a card it would
  change since the draft last wrote it (a `by: user` history entry, or a text edit shown by the `drafted-content`
  fingerprint the draft stores on each card); the error lists those cards so the agent can merge and call again.
- **Changes are history events.** `HistoryField` gains `content`: `to` lists what changed (`title`, `story`,
  `criteria`, `tasks`, or for a feature `description` and `stories`), `from` is the JSON of the old values of those parts (a story's `order` too), `by` is `session:<chat>`. A card
  whose text did not change gets no event and no write. Task ticks and criterion test links survive when their text
  is unchanged.
- **The settings apply as they do for logging.** The MCP's off switch refuses a call from a running chat. A read-only
  knowledge setting already withholds the whole MCP (`attach`), so it withholds `draft_cards` too, and a running chat
  is refused with a clear message. Both are read at each call.
- **Provider neutral.** Nothing here names a provider: the method, the tool and the writer are the MCP's and the
  server's. Any adapter that passes the `McpServerSpec` through can draft.

## Consequences

- Drafts exist only in main's working tree until a later story commits them, so the server needs main checked out to
  draft; otherwise the call is refused ("Main isn't checked out").
- A draft feature has no epic. Putting one under an epic is a later change.
- Old clients ignore `review` and `draftedBy`; both are optional on the Work list row.
