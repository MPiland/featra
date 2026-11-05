# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Desktop app built on Electron; the UI is a React + Vite web client, reused later for remote control.)

## Users

Solo builders ("vibecoders") who direct several AI coding agents across several of their own projects, working like a
product manager with a dev team. Often not engineers by trade. The first user is the author, dogfooding Featra on
itself. Solo is the target for M1 and likely M2.

Teams come later and need their own design: shared projects (e.g. a shared folder or server) and coordination so two
people's agents never take the same card or story.

## Product Purpose

Featra owns how a project moves from an agreed intention to an accepted result. Agent sessions run inside it on the
user's own logged-in CLIs. A Dev Lead (orchestrator) session shapes features with the user, drafts cards, and delegates
stories to sub-sessions in their own git worktrees. The user always sees where every feature stands and which facts are
evidence versus agent reports.

Success: a builder opens the app and can correctly say what remains and what changed in scope, without asking the
orchestrator for a summary.

## Positioning

Other ADEs are organised around sessions. Featra adds a view of the project's work: epics → features → stories → tasks,
counted (never percentages), with scope added after start, bugs a feature caused, and four distinct evidence states
(Reported, Verified, Proven, Accepted). It is one place: users will not juggle separate apps.

## Operating Context

- Multi-project: a projects switcher, like other ADEs. Each project is a local git repo with a `.featra/` card folder.
- A chat/session list grouped by provider (Claude now; Codex and others later), built dynamically from the user's
  setup. The Dev Lead is one chat in that list.
- Existing sessions can be imported and keep their native structure: Claude sessions with linked sub-sessions stay
  nested; Codex subagents show as nested chats the same way.
- Tool approvals appear inline in the session; they escalate to the Inbox only after waiting on the user for a while.
- Long working sessions, often on 13–14" laptop screens.
- A chat is just a chat. Starting a feature means starting a new chat; once the Dev Lead drafts a feature in it, the
  chat auto-renames to that feature and its story sessions nest under it. Chats that never become features are fine.
- Acceptance proof is a project setting, asked once by the Dev Lead when the first feature is shaped: screenshots,
  a Preview button, both, or neither. Featra takes screenshots itself with Electron's built-in Chromium
  (no Playwright, no extra install, no agent tokens) and also attaches the project's own test screenshots if present.
- Artifacts: a sidebar view over repo folders the user chooses. Init offers a starter set (screenshots and
  recordings, docs and plans, decision logs, generated pages) to accept, rename or skip; the user owns the folders.
- Install size matters: no bundled browsers or heavy dependencies.

## Capabilities and Constraints

- Cards are markdown files in the repo; each card has one owning branch or worktree at a time.
- Feature branch per feature; worktree per story; story PRs target the feature branch.
- A story may merge into its feature branch once Verified and Proven; Accept gates Done. Feature → main needs Accept.
- Bugs: the Dev Lead proposes the cause and routing; the user confirms.
- Progress shown as counts; burn-up from card history; no forecast.
- Zero token overhead for app features. Never reads vendor credential files. Never edits the user's CLAUDE.md or
  AGENTS.md on its own; it offers an editor (rich text over markdown) so the user can write them, and saves only
  what the user typed. Nothing hosted.
- M1 ships the Claude provider only (via the user's installed `claude`); Codex is M2.

## Brand Commitments

- Name: Featra (trademark check pending before public release).
- Must feel familiar to users of other ADEs (Orca, T3 Code, Conductor, Codex app, Claude desktop): left sidebar,
  projects switcher, chat list. Featra's difference lives in the work view, not in an unfamiliar shell.
- Free, open source, MIT.

## Evidence on Hand

- Featra's own backlog in `.featra/cards/` (real data for mockups).
- No users, testimonials or metrics yet. Demand is a hypothesis; do not fabricate adoption claims.

## Product Principles

1. Evidence over reports: always show which kind of fact you have.
2. Familiar shell, distinct work view.
3. Never force a flow; automations are settings.
4. Counts, not forecasts or percentages.
5. One place for everything a solo builder needs.

## Accessibility & Inclusion

- Dark and light themes, following the OS.
- Keyboard-first: every action reachable without a mouse.
- WCAG AA contrast for text and status marks.
- Dense but readable at laptop widths for long sessions.
