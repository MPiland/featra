# 0017 — The card pane: one card from its owner copy, edited one field at a time

Date: 2026-11-06 · Status: accepted

## Context

STORY-4 opens a story from the Work list in a pane docked beside it. The pane shows the whole card, edits its text in
place and changes its status and parent. ADR 0002 says each card has one owner, and ADR 0016 has the server resolve
the owner copy for the list. An edit from the pane must land in that copy only, never in a stale copy, and must not
write over a change an agent or an editor made while the user was typing.

## Decision

**Rules in work-format.** `card-edit.ts` holds the edit rules and `card-view.ts` builds what the pane shows; the
client-safe shapes are in `card-view-types.ts`, exported as `@featra/work-format/card-view`. The server and the client
import them; neither re-implements them.

- A `CardEdit` changes one field: the title, the user story (`description`), the notes, one AC's or task's text by
  index, the status or the parent. Each edit carries `from`, the value the pane showed. When the owner's value is no
  longer `from`, the edit is refused with "Changed since you opened it." and nothing is written.
- Status and parent go through `history.ts` (`setStatus`, `setParent`), so each appends a history event `by: "user"`
  on the server's clock. The status choices are the stages `checkTransition` allows from the current one, plus the
  current one, so Done shows only once the card is Verified and Accepted. Accept and Send back are a later story.
- Text that would not read back from the file as typed, such as a line starting `## `, is refused rather than saved.
  A title, AC or task is one line and can't be empty.

**Server.** `card.update` scans the folder fresh, finds the owner copy and applies the edit there. When the owner has
no copy, or isn't checked out in any worktree, the card is read-only and the refusal names why ("Check out feature/1 to
edit it."). The write is atomic: a temporary file in the same folder, then a rename. The server then rescans through
the watches, so every watcher gets the new card once; a watcher hears a card only when its JSON changed, so the events
from the temporary file and the rename push nothing extra.

**Protocol additions (ADR 0015).**

| Method        | Params              | Result                                                    |
| ------------- | ------------------- | --------------------------------------------------------- |
| `card.watch`  | `{ dir, id }`       | The `CardView`, or `null`; the request id names the watch |
| `card.update` | `{ dir, id, edit }` | `{ ok: true, view }` or `{ ok: false, error, view }`      |

`card.watch` pushes `card.view` events, and stops on `work.unwatch` or when the socket closes, like `work.watch`.

**Client.** The pane is an `aside` beside the list, full height, never a popover. A story title is a button that opens
it and moves focus into it; Escape closes it when no field is using Escape, and focus goes back to the story. Text
fields use `InlineText`: Enter or a click edits, leaving the field saves, Escape cancels. While a field is open, pushes
don't replace what the user typed. A refused save keeps the typed text, shows the refusal and the value now, and the
next save is made from that value.

## Consequences

- Two writers can't silently overwrite each other through the pane: the later one is refused and sees the other's
  value.
- **Limit.** A parent change can change a card's owner (a story moved under a feature whose branch exists). The edit is
  written to the owner the card had before the move; the next scan resolves the new owner as ADR 0016 says.
- **Limit.** Ticking an AC or a task, and adding or removing one, are not pane edits yet.
