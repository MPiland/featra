# 0042 — Changes asked before approving a feature

Date: 2026-11-23 · Status: proposed

## Context

STORY-71 lets the user say "Not yet" on a feature's review screen instead of approving it. The reason has to reach the
Dev Lead who runs the feature, the screen has to show that changes are asked until the Dev Lead says it handled them
(or the user dismisses them), and all of it has to survive a restart. Approve must stay available: asking for changes
is advice to the Dev Lead, not a gate. STORY-72 (evidence), STORY-25 and STORY-73 build on the same screen.

## Decision

- **Three new history events on the feature card**, appended where its branch has its card (`writeFeature`, in the
  card lane):
  - `changes-asked` — `to` is the user's reason (trimmed, at most 2000 characters), `by` is `user`.
  - `changes-handled` — `to` is the Dev Lead's reply, `by` is `session:<chat>` of the Dev Lead's chat.
  - `changes-dismissed` — `to` is null, `by` is `user`.
- **The screen's state is replayed from those events** (work-format `changesOf`): a round opens with the first
  `changes-asked`, gathers each later one while no reply has come, and ends with `changes-handled` (its reply stays on
  the screen until the next ask starts a new round) or with `changes-dismissed` (nothing shows). Nothing is held in
  memory, so a restart shows the same thing. `review.watch` carries it as `changes`.
- **The reason is sent, then recorded** (the send-then-record path Send back uses): it goes to the feature's Dev Lead
  chat as the user's message ("Changes asked on FEAT-n: reason"), and only then is `changes-asked` committed. A failed
  record answers `recorded: false` with the message already sent.
- **The Dev Lead is found the way shaping finds it**: the chat that drafted the feature (`drafted-by`), else the parent
  chat of one of its story sessions; `chats.open` resumes it. Without one, "Not yet" is refused ("This feature has no
  Dev Lead chat."), and with one Featra no longer has or whose project is closed, it is refused ("The Dev Lead's chat is
  gone."). A busy chat refuses as a normal send does. Nothing is recorded, queued or created in any of these cases;
  the user can start a Dev Lead chat and say it there.
- **Only the Dev Lead ends a round, through the MCP tool `mark_changes_handled`** (agent method
  `feature.changesHandled`), following `write_summary`: Dev Lead chats only, story sessions refused, taught in the
  tool's description. A chat reply alone doesn't clear "Changes asked".
- **Handled and Dismiss are recorded only while changes are asked**, checked again inside the card lane, so of a reply
  and a Dismiss made at once exactly one is kept; the other is refused.
- **"Not yet" creates no cards** and doesn't touch the approval: `featureApprovalOf` ignores these events.

## Consequences

- The feature's history tells the whole review conversation in order, and it travels with the card to main.
- Each ask, reply and dismissal is one commit on the feature branch (`FEAT-n: changes asked`, `… changes handled by the
  Dev Lead`, `… changes dismissed`).
- A feature with no live Dev Lead chat can't be sent back from the review screen; the refusal says why.
