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
- OXC's rule set is younger than ESLint's. STORY-41 found these gaps and covers each as follows:
  - **No import-boundary rule like `eslint-plugin-boundaries`.** Covered by `no-restricted-imports` per package
    (overrides on `packages/work-format/src` and `packages/client/src`) plus `import/no-nodejs-modules`. Patterns need
    `/**` to catch deep imports (`@featra/*` alone misses `@featra/client/bridge`). Lint fixtures prove each boundary.
  - **No separate React Hooks plugin.** oxlint ships the hooks rules in its `react` plugin; they report as
    `react-hooks(...)`. `react/rules-of-hooks` and `react/exhaustive-deps` are on as errors.
  - **Type-aware rules are a separate binary.** `oxlint-tsgolint` runs them (`--type-aware`), on TypeScript 7. Its
    `no-unnecessary-type-assertion` autofix removed casts `tsc` needed on Testing Library queries; we use the queries'
    type parameters instead (`getByRole<HTMLInputElement>`) and never apply that fix blindly.
  - **`unicorn/consistent-function-scoping` misreads `page.evaluate` callbacks**, which run in the browser and can't
    use module scope. Disabled for that one block in `apps/desktop/e2e/contrast.ts`, with a comment.
  - **`vitest/valid-expect` assumes Jest's one argument.** Set to `maxArgs: 2` for Vitest's message argument.
  - **`jsx-a11y/prefer-tag-over-role` fights ARIA widgets** (listbox, menu, radiogroup built on `ul`/`li`). Off;
    `no-noninteractive-element-to-interactive-role` lists the widget roles allowed per tag instead.
  - **One disabled a11y rule:** `click-events-have-key-events` on the Dropdown option, whose listbox owns the keyboard.
    The comment there says so.
  - **No length cap for CSS or Markdown, and no stylelint.** `max-lines` covers JS and TS only. CSS and docs are
    covered by review (the coding-standards checklist).
  - **`no-await-in-loop` (in `perf`) can't tell deliberate order from waste.** Every case in the repo is sequential
    on purpose: tray probes run in order and the first that answers decides, the project search walks up one folder
    at a time, and tests drive the UI step by step. Off; review catches a loop that should be `Promise.all`. The rest
    of `perf` is on.
- The fixtures that prove the rules live in `lint-fixtures/` beside the package they test. `pnpm lint` skips them;
  `tooling/test/lint-rules.test.ts` lints them through the real `.oxlintrc.json`.
- The hook runs `pnpm check` on the working tree, not only the staged files. A commit with unstaged broken code is
  blocked too, which is the safer side.
- `pnpm install` sets `core.hooksPath` to `.githooks` (a relative path, in the repository's shared config), so every
  worktree runs its own checkout's hook.
- The codebase gets one formatting commit. After that, no commit lands that fails the gate, whoever writes it.
