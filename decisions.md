# Decisions log

Short, dated decisions made in conversation. Larger, durable decisions get an ADR in `docs/adr/`.

- 2026-11-04 — Product name: Featra. Trademark and registrar check before public release.
- 2026-11-04 — M1 split into M1a (core loop, manual merges) and M1b (auto-merge, approval screen, annotations, UAT,
  knowledge promotion). Remote control is M2.
- 2026-11-04 — Claude is the only provider in M1; Codex and ACP agents in M2.
- 2026-11-04 — Home view is the feature list; the stage board is a read-only secondary view.
- 2026-11-04 — Burn-up counts items (stories and bugs) in both progress modes: task ticks are not history events, so a
  task-level burn-up can't be rebuilt from `history[]`. Feature rows still honour the `tasks` setting.
- 2026-11-04 — In `tasks` progress mode a Done story counts all its tasks as done.
- 2026-11-04 — Acceptance is explicit: `accepted`/`withdrawn` events. Moving a card back does not silently revoke it.
- 2026-11-04 — Claude provider: Agent SDK with `pathToClaudeCodeExecutable` set to the user's installed `claude`
  (the T3 Code pattern). Featra never offers a login or reads credentials. Anthropic's SDK terms make this a grey
  area; an API-key provider is on the roadmap as a fallback. See `docs/spike-claude-sdk.md`.
- 2026-11-04 — Sessions keep the SDK's default `settingSources` (user, project, local) so they behave like the user's
  own `claude`.
- 2026-11-04 — TypeScript is restricted to erasable syntax (`erasableSyntaxOnly`) so packages run under Node's
  built-in type stripping without a build step.
- 2026-11-05 — Researcher stories (no code, so no CI) reach Done on the user's Accept alone, whatever `requireAccept` says.
  All other stories still need Verified.
- 2026-11-05 — Linux is a supported M1 platform alongside Windows and macOS. Each story's tests also run on Linux
  (Ubuntu under WSL2 on the dev machine). Linux trays often ignore a click, so the tray always has a right-click menu
  with Show Featra and Exit; when no tray is available, the close button quits instead of hiding the window.
- 2026-11-05 — Agents get tools through MCP, so they work with any MCP-capable agent, not only Claude or Codex. Agents
  driving the in-app browser is STORY-40 in M1b (FEAT-10). Desktop computer use goes on the roadmap. Both are off by
  default, because tool definitions cost context tokens on every turn.
- 2026-11-05 — Code follows `docs/coding-standards.md`: one concern per file, no monolith files (about 300 lines is the
  signal to split), shared controls in `components/controls/`, shared helpers in topic `utils/` modules, no one-off
  helper files. A story isn't ready for review until its changes follow it. Existing code is brought in line as it's
  touched (SettingsView and the stylesheet in STORY-20); `main.ts` is split by job in a FEAT-13 refactor.
- 2026-11-05 — Professional engineering standards apply to all code: `docs/coding-standards.md` (quality gate, structure,
  TypeScript, errors, security, review checklist), `docs/architecture.md` as the code map, and ADRs for every
  architecturally significant decision (`docs/adr/README.md`). Missing ADRs 0007–0013 were backfilled from this log.
- 2026-11-05 — Lint and format use OXC (oxlint and oxfmt), with a `pnpm check` pre-commit gate (ADR 0014). Built in
  STORY-41, after STORY-20 and before STORY-19.
- 2026-11-05 — Settings copy is short and standard, the way established desktop apps word it (for example "Minimize to
  tray" or "Quit"). There's no flavour text, and a description appears only where the label alone would mislead.
- 2026-11-05 — Remote control MVP (M2) goes over Tailscale, with an SSH tunnel to the local server as an alternative.
  We don't build on Claude's or Codex's own Remote Control: it belongs to the vendor's running process, not the
  session. Imported sessions are resumed in place (as `claude --resume` does), so their turns carry over to the
  vendor's own apps the way they do natively.
