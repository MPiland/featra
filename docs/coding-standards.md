# Coding standards

Every session that writes code in this repo follows these rules. A story isn't ready for review until its changes
pass the quality gate and the review checklist below. Where a rule and the code disagree, fix the code when you touch
it; don't copy the old pattern.

## Quality gate
Run these before every commit. All must pass with no warnings. Lint and format use OXC (ADR 0014).

- `pnpm format:check`: formatting with oxfmt.
- `pnpm lint`: lint with oxlint. No rule is disabled inline unless a comment says why.
- `pnpm typecheck`: TypeScript, strict.
- `pnpm test`: unit and integration tests.
- The story's e2e tests on Windows and Linux.

`pnpm check` runs the first four, and a pre-commit hook runs it too. Never skip the hook (`--no-verify`).

## Architecture and structure
- **Follow the package boundaries** in [docs/architecture.md](architecture.md):
  - `work-format` is pure domain logic.
  - `client` is UI.
  - `apps/desktop` is the Electron platform.
  - Dependencies point inward, toward `work-format`, never the other way.
- **One concern per file.** A file does one job: a component, a pure model, a service or an adapter. Don't put a page's
  layout, its reusable controls and its data logic in the same file.
- **No monolith files.** A file over about 300 lines probably holds more than one concern, so split it before it grows.
  Stylesheets follow the same rule: split them by area (tokens, shell, settings, menus).
- **Separation of concerns:**
  - Pure logic (rules, rollups, parsing, labels) lives in plain TypeScript modules with no React or Electron imports,
    so it can be unit-tested directly.
  - React components render and handle input, and call into the pure modules.
  - Electron main code is split by job (windows, tray, menus, IPC, settings storage).
- **Side effects at the edges.** Code that touches the file system, network, clock, processes or IPC sits behind a
  small interface that is passed in, so tests can fake the platform and keep the logic real.
- **Reusable UI controls** (switch, segmented control, dropdown, setting row, dialog) each get their own file under
  `packages/client/src/components/controls/`. Every page uses them, and no page keeps a private copy.

## Reuse (DRY)
- **Search for an existing helper before writing one.** Two copies of the same logic will drift apart.
- **Shared helpers go in the owning package's `utils/` folder**, grouped by topic (`utils/platform.ts`,
  `utils/format.ts`). Never use a catch-all `utils.ts`.
- **A helper that several packages need** goes in the lowest package they all depend on: `work-format` for domain rules.
- **No one-off files.** A helper used in one place stays next to its only caller. When a second caller needs it, it
  moves to `utils/`.
- **Constants and copy shown in more than one place are defined once.** This covers labels, shortcuts and settings keys.

## TypeScript
- `strict` and `noUncheckedIndexedAccess` stay on. No `any`; use `unknown` and narrow it. Prefer `type` imports.
- Model states as discriminated unions, and use exhaustive `switch` statements that end in a `never` check.
- Avoid non-null assertions (`!`) in product code; handle the missing case. Tests may use them.
- Validate data that crosses a trust boundary at that boundary: IPC payloads, files on disk, agent and MCP input.
  Inside the boundary, trust the types.
- Only erasable syntax is allowed (no enums, namespaces or parameter properties). See ADR 0008.

## Errors and logging
- **Never swallow an error.** Handle it, add context and rethrow it, or log it and show the user what failed.
- Errors shown to the user say what happened and what to do next.
- Main-process logging goes through the app logger (`userData/logs/main.log`), never `console.log`.
- Logs never include credentials, tokens or prompt contents.

## Security (Electron)
- Every renderer runs with `contextIsolation` on, `nodeIntegration` off and the sandbox on. The renderer reaches the
  platform only through the typed preload bridge.
- Every IPC handler checks its input and only does what its name says.
- Never read vendor credential files. Never write CLAUDE.md or AGENTS.md on the app's own initiative.

## Naming, comments and docs
- Name files after the one thing they export (`Switch.tsx`, `settings-store.ts`). React components use PascalCase;
  everything else uses kebab-case.
- Names say what something is in the domain language of [CONTEXT.md](../CONTEXT.md).
- Comments explain *why*, not *what*. Exported functions and types get a one-line TSDoc comment when the name alone
  isn't enough.
- **Record architecturally significant decisions as an ADR** in `docs/adr/` (see its README). This covers decisions
  that are hard to reverse, that change a package boundary or dependency, or that a future contributor would question.
  Smaller decisions go in `decisions.md`.

## Dependencies
- Every new dependency needs a reason in the commit message and an MIT-compatible licence. Prefer the platform (Node,
  Electron, the browser) or a few lines of our own code over a package.
- Versions are locked by `pnpm-lock.yaml`. Install with `--frozen-lockfile` in checks.

## Tests
- Follow the Definition of Done:
  - real product code in every test, with only the platform faked;
  - one journey test per story;
  - a failing regression test before every bug fix;
  - never weaken an assertion.
- Test files mirror the source file they test (`settings.ts` is tested by `settings.test.ts`).

## Commits
- Small commits, each passing the gate, each about one thing.
- Commit messages say what changed and why, starting with the card ID (`STORY-20: …`).
- Never push. Code commits need the user's go-ahead.

## Review checklist (before In Review)
- [ ] The gate passes, on Windows and Linux.
- [ ] No file grew past about 300 lines without being split. No duplicated logic. Helpers are in the right place.
- [ ] Boundaries respected: no React or Electron in `work-format`, and no platform calls outside adapters.
- [ ] Errors are handled, IPC input is checked, and nothing sensitive is logged.
- [ ] Each AC has a test, plus a journey test. No assertion was weakened.
- [ ] An ADR is written or updated if the change is architecturally significant; `decisions.md` is updated for smaller
      decisions.
- [ ] `docs/architecture.md` and `CONTEXT.md` still match the code.
