# 0012 — Local server with a rebuildable SQLite index

Date: 2026-11-04 · Status: accepted

## Context

Featra needs a fast view of cards across many branches and worktrees, plus ID allocation and ownership tracking. Cards
live in git, which is the source of truth, but scanning every branch on each render is too slow. Nothing may be hosted.

## Decision

A local Node server runs on Electron's Node runtime (`ELECTRON_RUN_AS_NODE`). It is bound to 127.0.0.1 and serves a
WebSocket API (the T3 Code pattern).

It keeps a SQLite index (`node:sqlite`) of ownership, IDs and rollup inputs. The index can always be rebuilt from the
files and git, and never holds anything that can't be.

## Consequences

- Deleting the index loses nothing.
- The client talks to one API, whether it runs in Electron or, in M2, remotely.
- The server makes all writes, so ownership rules (ADR 0002) are enforced in one place.
