# Coding standards

Every session that writes code in this repo follows these rules. A story isn't ready for review until its changes do.

## Structure
- **One concern per file.** A file does one job: a component, a pure model, a service or an adapter. Don't put a
  page's layout, its reusable controls and its data logic in the same file.
- **No monolith files.** Over about 300 lines is a sign that a file holds more than one concern; split it before it
  grows. A stylesheet follows the same rule: split it by area (for example base tokens, the shell, settings, menus)
  rather than keeping one app-wide file.
- **Separation of concerns:**
  - Pure logic (rules, rollups, parsing, labels) lives in plain TypeScript modules with no React or Electron imports,
    so it can be unit-tested directly.
  - React components render and handle input; they call into the pure modules.
  - Electron main code is split by job (windows, tray, menus, IPC, settings storage), not kept in `main.ts`.
- **Reusable UI controls** (switch, segmented control, dropdown, setting row, dialog) live in their own component files
  under `packages/client/src/components/controls/`, and every page uses them. No page has a private copy.

## Reuse (DRY)
- **Before writing a helper, search for an existing one.** Two copies of the same logic is a bug waiting to happen.
- **Shared helpers go in a `utils/` module of the package that owns them**, grouped by topic (`utils/platform.ts`,
  `utils/format.ts`), never a catch-all `utils.ts`.
- If more than one package needs a helper, it goes in the lowest package they share (`work-format` for domain rules).
- **No one-off files.** A helper used in one place stays next to its only caller, until a second caller needs it; then
  it moves to `utils/`.
- Tests import real product code; they never copy it (see the Definition of Done).

## Naming and size
- Name files after the one thing they export (`Switch.tsx`, `settings-store.ts`).
- Prefer small functions with one job and a clear name over comments explaining a long one.
