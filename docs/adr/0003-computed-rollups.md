# 0003 — Rollups are computed, never stored

Date: 2026-11-04 · Status: accepted

## Decision

Feature and epic progress, added-scope counts and bug counts are computed from child cards by `work-format`. Parent
cards never store them.

## Consequences

Two stories never edit the same parent file, so merges into the feature branch don't conflict on rollups. The SQLite
index may cache rollups but is always rebuildable.
