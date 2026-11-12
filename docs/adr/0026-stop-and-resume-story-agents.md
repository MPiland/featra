# 0026 — Watching, stopping and resuming a story agent

Date: 2026-11-11 · Status: accepted

## Context

STORY-9 (ADR 0025) starts a story agent as a Featra session in its own worktree. STORY-53 lets the user watch it, stop
it and go on later. A story session is the Dev Lead's to steer (STORY-54), so the user only watches it; Stop and Resume
are the user's own action, from any client, with no confirmation (remote use over Tailscale is planned).

## Decision

- **A story session is read-only.** It shows the live transcript and no composer; the user steers through the Dev Lead.
  The agent's thinking is shown where the provider exposes it: a new `thinking` chat event and transcript item, a muted
  collapsible block apart from the reply. Claude is asked for `thinking: { type: "adaptive", display: "summarized" }`,
  so the transcript has the summary Claude gives, not the raw thinking.
- **Stopped is derived from the card's history, not stored as a field.** The last history event with
  `field: "stopped"` says it: `to: "stopped"` means Stopped, `to: null` (Resume's event, `from: "stopped"`) clears it.
  One fact in one place; the event is both the mark and the audit trail, and the card format, parser and serializer
  change only by `"stopped"` joining `HISTORY_FIELDS`. The Work row's `stopped` is read from it by `isStopped`, so every
  client shows the same mark. Stop keeps the card's stage; neither Stop nor Resume touches the worktree.
- **Story-keyed methods, run through the card lane.** `story.stop` and `story.resume` (`{dir, id}`) on the window socket
  find the story's newest session, act on it, then write the owner's copy of the card atomically. Stop ends the running
  turn through the provider (`interrupt`), or drops a turn still waiting for a slot (`cancelTurn`, STORY-9). It refuses
  a story with no agent, one already stopped, or a session that isn't running; Resume refuses a story that isn't
  Stopped. There is no Dev Lead tool for stop in this story.
- **Resume goes through the provider interface.** `ProviderAdapter.resumes` says a provider can go on in a stopped
  session; Claude sets it. A provider without it refuses with "This agent can't resume a stopped session." Resume sends
  "Continue from where you stopped." as the session's next turn, in the same provider session (a live agent hears it;
  one whose process has gone is started again with its session id), so the transcript is the same one.
- **The cap is unchanged.** A turn holds a slot only while it runs, so a stopped session has freed its slot and does not
  count. Resume is a turn like any other: it takes a slot, or waits Queued.

## Review rulings (PR 28)

- **The card is written first.** Stop marks the story Stopped, then interrupts; Resume checks everything (the provider
  resumes, an agent and session exist, nothing is running), clears the mark, then sends. A failed card write therefore
  stops or sends nothing, and a failure after the mark leaves a Stopped story with Resume. The interrupt is bounded
  (10 s) and the card lane is not held across it, so a stuck provider can't block other stories' cards.
- **Stop on a story queued and never started drops it from the queue** (`stories.dropped`, the same path a cancelled
  spawn takes). Its card keeps its stage and gets no Stopped mark; the `"queued"` history field (`HISTORY_FIELDS`)
  records that it left the queue, but only where the owner's copy is writable: a never-started story's card lives on the
  feature branch, which nobody has checked out, so the normal case writes no event (nothing about the story changed, and
  writing one would need a commit on the feature branch). The slot count and the queue's order are unchanged for the rest.
- **Stopped does not outlive the session.** The Work row's `stopped` is true only in a non-terminal stage (`stoppedIn`),
  and `startedStory` clears a stale mark with the clearing event.
- **Resume is also offered on an idle In Progress session that ended without finishing** (a failed turn, a question, or a
  restart that cut the turn off). The chat row carries `stalled` for this (set by `foldSummary` on a failed turn of a story
  session, by `idleSummary` on a restart, cleared by the next message). Same path, same cap rules, and a history event
  only when the story was Stopped. The session stays read-only: no composer.
- **Thinking is asked for only on models that support adaptive thinking** (the Claude provider's own list), so a model
  that doesn't gets no `thinking` option. It is unverified on the real CLI for the unsupported ones; see
  docs/spike-claude-sdk.md#thinking.
- **The header shows Resume only after the turn has ended**, so it can't be pressed on a turn that is still stopping.

## Known gap

A story that is queued and never started has no Stopped mark to show: Stop only removes it from the queue (see above).
