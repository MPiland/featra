---
id: BUG-28
type: bug
title: Local pre-commit tests time out when the machine is busy
status: New
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-17T00:10:49Z
history:
  - at: 2026-11-17T00:10:49Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

On 2026-11-16, four commit attempts that only changed cards or `decisions.md` failed the local pre-commit gate with
2 to 19 server tests timing out ("No matching frame in 20000 ms", "Hook timed out in 30000ms", "Test timed out in
60000ms"), and a different set each time. Seen in story-merge-github, story-prs-proven, feature-end-\*, story-abandon,
merge-request, story-checks-run, draft-\*, server-process and others. They pass alone and in CI.

Some showed wrong-path errors under load: a test that expected a conflict got "STORY-1 has no PR" instead.

Suspect fixed timeouts and pollers racing under load.

## Acceptance criteria

- [ ] The local pre-commit gate passes on a busy machine
- [ ] No test relies on a fixed wall-clock wait

## Tasks

## Notes

Related: BUG-5 (unit tests time out under load), BUG-6, BUG-7 and BUG-18 (fixed waits missed under load).
