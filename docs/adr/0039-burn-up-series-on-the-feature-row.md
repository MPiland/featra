# 0039 — The burn-up series rides on the feature row; the client reads it per local day

Date: 2026-11-13 · Status: proposed

## Context

STORY-16 draws a feature's burn-up in its progress pane: a scope line and a done line from the scope baseline (ADR 0038) to now, one point per day, counting what the feature row counts (stories, or tasks when `progress` is `tasks`),
with uncommitted card changes included (ADR 0016) and no forecast (ADR 0005). Rollups are computed, never stored (ADR
0003). The Work list is built on the server from the owner copies and pushed to the client by the watch; the client
never calls back for it. Days are the user's days, so "per day" depends on the time zone, which the server shouldn't
have to know, and on the clock, which moves without any card changing.

## Decision

- **The series is computed in work-format by the existing `burnUp` and carried on the feature row.** `buildWorkList`
  adds `burnUp: { since, points }` to a started feature's row: the baseline and the change points (each moment scope or
  done changed). There is no second series builder. A feature with no baseline has no `burnUp` field.
- **The row carries change points, not days.** They don't depend on the clock, so time passing never makes the server
  push a new list.
- **The client samples per local day at render time** with work-format's pure `burnUpDays(chart, current, now)`: the
  baseline itself, then each local midnight after it (the values strictly before that midnight, labelled with the day
  that ended), then now. The time zone is the platform's (`Date` in local time), so days follow daylight saving changes.
  A feature started mid-day has that part day as its first day.
- **The last point is the row's own count.** The now point takes `progress.done` and `progress.total` from the feature
  row, so the chart and the row agree by construction.
- **Tasks mode is replayed from `content` events.** Each item weighs the tasks it had at the time (`tasksAt`: a task
  edit records the list it replaced in `from`), and a done item counts all of them. Ticks are not recorded in the
  history, so the ticks of open items show only in the now point.
- **No timer.** The chart redraws when the list is pushed or the pane opens; a day boundary passed while the pane sits
  open shows on the next push.
- **Plain SVG**, two step lines, no chart library. The image is named by the current numbers and the start day, and a
  visually hidden table gives every point.

## Consequences

- The list grows by one small array per started feature (one entry per change).
- The server needs no time zone and no clock-driven pushes. The client's day labels follow the user's clock.
- A pane left open across midnight keeps the old day until anything changes. That is noted on the roadmap.
- Task tick history would need a new history field. Until then, tasks mode is exact for scope and for done items, and
  ticks count from now.
