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

## Known gap

A session that was queued and never started (its first turn still waiting) has no agent: Stop refuses it as not
running. A later turn that waits Queued can be stopped. Dropping a never-started spawn is left to a follow-up.
