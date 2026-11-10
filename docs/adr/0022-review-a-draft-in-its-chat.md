# 0022 — A draft is reviewed in the chat that drafted it, as a docked card pane

Date: 2026-11-10 · Status: accepted

## Context

STORY-8 (ADR 0021) has an agent leave a Draft feature with `drafted-by` naming its chat. STORY-49 is where the user
reviews it: next to the conversation that made it, editing it with the card pane (ADR 0017). Three things had to be
decided: how a pane edit of a draft is recorded so the draft's guard still protects it, what names the chat, and how
the pane sits in a chat.

## Decision

- **Every card pane text edit appends a `by: user` `content` history event**, for every card, not only drafts. `to`
  names the part (`title`, `story`, `notes`, `description`, `criteria`, `tasks`), `from` is the JSON of its old value
  (a list part records the whole list as it was), `at` is the server's clock. An edit that changes nothing writes no
  event. The event is written by `applyCardEdit`, so the pane, the server and the guard share one rule. Before this
  the pane's text edits wrote no history and the draft guard relied on its fingerprint alone.
- **The draft guard reads those events.** A `by: user` event after the draft's last entry still means "the user edited
  this", except status, evidence and acceptance moves, and now `notes` edits (a draft doesn't write notes, so the
  agent isn't blocked by them). A user who types the draft's text back is still seen, since the history remains.
- **A draft feature's status list offers only its current status.** Approving is STORY-51's Approve; the pane's
  dropdown must not do it by another route.
- **A feature's card view lists its `stories`** (non-Cancelled, in order: id, title, stage). The pane shows them as a
  list; opening one is a move inside the same pane, with "Back to FEAT-N" to return. Work's pane passes no opener and
  is unchanged.
- **The pane is docked in the chat, never floating.** The chat is wrapped in the same `.work-split` the Work list uses,
  with the same handle and chosen width (`useDockedPane`, shared). The draft is read from the Work list (the one place
  that knows what a draft is) as the feature with `review` and `draftedBy` equal to the chat. When the draft appears
  while the chat is open the pane opens without taking focus from the composer. A draft already there when the chat
  opens is not opened by itself; the header offers **Review draft**. **Review draft** in a draft's Work row opens the
  chat with the pane, focused.
- **The chat takes the feature's title, unless the user named it.** `ChatSummary.titleBy` records who set the title:
  `message` (the first user message, as before), `draft` or `user`. `retitle` (pure, `work-format`) lets a draft
  replace a `message` or `draft` title, never a `user` one. The agent bridge renames after a successful draft, so a
  refused draft doesn't rename, and a revised draft follows the feature's title. Nothing renames by hand yet; the
  `user` value is reserved for the rename a later story adds, and the rule is tested now.
- **Provider neutral.** Nothing here names a provider; the rename and the pane work for any chat that drafts.

## Consequences

- Card history gains a `content` entry for each text edit, so card files grow with edits.
- Old chat summaries have no `titleBy`; they read as `message`, so a draft may rename them.
- Send back (STORY-50) and Approve or Reject (STORY-51) add their own controls to this pane.
