# 0004 — Distinguish reported, verified, proven and accepted

Date: 2026-11-04 · Status: accepted

## Context

The original pain: a dashboard that is only as true as the orchestrator's own report.

## Decision

Featra records and shows four distinct evidence states for a story: **Reported** (an agent said so), **Verified** (PR CI
passed), **Proven** (the AC's linked test passed), **Accepted** (the user signed off). "Done" requires at least
Verified, plus Accepted where the project requires it.

The history also records `checked:<commit>`, the commit the latest verdict was for (ADR 0034).

## Consequences

The UI must never present a reported state as fact. Progress copy says "6 of 10 stories done", never "60% complete",
because counts don't measure effort.
