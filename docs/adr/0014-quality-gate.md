# 0014 — OXC for lint and format, with a pre-commit quality gate

Date: 2026-11-05 · Status: accepted

## Context
Until now the only automated checks were `tsc` and the tests. Agent-written code drifts in style, duplicates helpers
and crosses package boundaries unless a tool stops it. The repo has no remote and no CI, so the gate must run locally
and fast enough that nobody is tempted to skip it.

We considered ESLint with Prettier, Biome, and OXC.

## Decision
Use OXC for both linting and formatting:

- **oxlint** for linting.
  - Its built-in TypeScript, React, React Hooks, jsx-a11y and import rules are on.
  - Type-aware rules run where oxlint supports the repo's TypeScript version.
  - Rules on top: an import-boundary rule enforcing ADR 0011, and a file-length cap (`max-lines`) as the signal to
    split a file.
- **oxfmt** for formatting.
- **`pnpm check`** runs format check, lint, typecheck and unit tests.
- **A git pre-commit hook** runs `pnpm check`.

STORY-41 builds the gate. Where an OXC rule we want doesn't exist yet, it records what's missing and how it's covered
meanwhile, in this ADR's Consequences.

## Consequences
- One tool family, written in Rust, so the gate runs in seconds.
- OXC's rule set is younger than ESLint's, so some rules may be missing; STORY-41 lists any gaps.
- The codebase gets one formatting commit. After that, no commit lands that fails the gate, whoever writes it.
