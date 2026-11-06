# 0008 — Erasable TypeScript, no build step for packages

Date: 2026-11-04 · Status: accepted

## Context

Node 24 runs TypeScript directly by stripping types, but only syntax that can be erased: no enums, namespaces or
parameter properties. A build step per package adds tooling, watch modes and stale-output bugs.

## Decision

- `erasableSyntaxOnly` is on in `tsconfig.base.json`.
- Packages ship their `.ts` sources and import each other by source path.
- Vite bundles the renderer, and Electron main has its own build.
- `tsc` only type-checks.

## Consequences

- Scripts and tests run `.ts` files directly with `node`.
- Use union types and `as const` objects instead of enums.
- A package published to npm would need its own build step.
