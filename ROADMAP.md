# Roadmap

This file lists ideas that are outside the current milestones. Work that the current scope needs goes in
`.featra/cards/`, not here. When a roadmap item is picked up, it becomes cards and comes off this list.

Current milestones are M1a (prove the core), M1b (automation and review) and M1c (everyday ADE). They're tracked as
epics in `.featra/cards/`.

## M2 and later

- **Run end-to-end tests linked to criteria.** A per-path template (for example Playwright with a JUnit reporter) so
  e2e refs can prove criteria; STORY-56 shows "No command runs this test" for them.
- **Structured test links on cards.** Replace the free-text `(test: path::name)` link, which breaks on `)` or `;` in a
  test name.
- **Re-run checks for commits made while Featra was closed.** STORY-56 takes a baseline at startup.
- **Guided GitHub setup.** Help builders who don't have GitHub install `gh`, sign in and create the repo. Until then,
  FEAT-6 says in one line what's missing and works in local mode.
- **Clean up subagent worktrees.** The SDK does not report a subagent's worktree (STORY-55); when it does, Archive removes
  the worktree if it is clean and keeps it, with a short message, if it has changes.
- **Featra plugins** (ADR 0029): anyone builds plugins others install. A plugin can add a full pane, a modal, sidebar
  views and actions with its own buttons (for example a UX design pane that annotates image, PDF or Figma mockups and
  sends the notes to the story's agent), through a permissioned Featra API (cards, sessions, project files, Inbox,
  settings, named network hosts). An opt-in tier runs local programs. Plugins can bundle role presets and provider
  parts. Installed from git or URLs and from marketplace lists; a curated registry later.
- **Remote control** (MVP), phone first, reusing the same React client against the local server. Over Tailscale
  (for example Tailscale Serve, reachable only inside the tailnet), with an SSH tunnel to the server as an alternative
  for users without Tailscale. Featra never exposes a public port, and it keeps nothing hosted. It does not rely on
  vendors' own remote-control features: imported sessions are resumed in place, so they carry over to the vendor's CLI the
  way they do natively.
- **Keep queued story sessions across a restart** (FEAT-5 keeps the queue in memory), or tell the Dev Lead the
  queue was cleared.
  The same goes for story notices held for a busy Dev Lead: they live in memory and are lost across a restart (accepted
  for STORY-54).
- **Restore subagents after a restart:** a session's subagents live in memory and are gone with the process (STORY-55).
  The SDK can read them back (`listSubagents`, `getSubagentMessages`), so a restored session could list them again.
- **Story notices in the Inbox when no Dev Lead is open:** a story whose Dev Lead is gone gets its ended, stopped and
  failed notices shown to the user, as its questions already are.
- **A per-story notice budget or back-off:** a Dev Lead and a story session can message each other without limit
  (`message_session` and notices), and nothing stops a loop.
- **Evidence in the card pane:** show an acceptance criterion's evidence link there (STORY-10 writes it to the card;
  the pane does not show it yet).
- **Agents link tests to criteria** through `update_card` (today a criterion's `test:` link is written by hand, not by
  an agent's report).
- **More providers:** Codex next (a runner behind the provider-neutral spawn interface from FEAT-5), then ACP agents.
- **Agents from different providers in one room:** for example ChatGPT as UX and Claude as developer working the
  same project. First step is free once a Codex runner exists: the Dev Lead relays through `message_session`. The
  open design is direct agent-to-agent talk: turn-taking, loop and token guards, what the user sees, and each side's
  permissions. Explore with the user before shaping.
- **Sidebar grouping as a choice:** group chats by feature or by provider, with each chat showing its provider as a
  badge, so mixed-provider work reads as one team.
- **Knowledge:** a generated knowledge index, and an opt-in work protocol.
- **Importers** for BMAD, spec-kit, OpenSpec and GSD.
- **SSH remote compute.**
- **Teams:** shared projects (for example a shared folder or server), and coordination so two people's agents never
  take the same card or story.
- **Rebindable keyboard shortcuts** with conflict detection and per-platform defaults. M1 lists shortcuts read-only in
  Settings.
- **Command palette** (View > Command Palette, Ctrl+K): every menu action and view, searchable.
- **Search** (Go > Search…, Ctrl+Shift+K) across chats and cards.
- **Remove a project from the list**, and reorder or pin projects in the switcher.
- **Desktop computer use** for agents: screenshots plus mouse and keyboard control of other apps, offered as MCP tools
  so any agent can use them. Off by default (tool definitions cost tokens), with per-app approval, browsers and
  terminals restricted, and macOS screen-recording and accessibility permissions. Linux under Wayland limits it. M1
  covers browser use only (STORY-40).

- **Performance: unwatched projects pay two git scans per card write.** Reuse git state for lane writes on unwatched
  folders, as the watched path does (ADR 0016). Not M1 scope.
- **Test hygiene:** the ordering case in `agent-card-update-review.test.ts` needs the STORY-6 session that the "who is
  calling" case spawns, so it fails when run alone; make each case build its own.

- **Test hygiene:** a shared `startChat(page, role)` e2e helper. The picker-then-composer sequence is hand-rolled in
  about 11 specs (chat, chat-log, composer, draft, inbox, review-draft, chat-approvals, chat-questions, chat-list,
  chat-restore, roles), so a fix like BUG-17's has to be made in each.

- **PR chip: required versus optional checks.** The chip reports every check while Verified uses only required checks,
  so a Verified story can show "Checks failing" from an optional check. Show which checks are required. From STORY-11.

- **CI test reports: download limits.** Only the XML read is size-limited; downloads have no total size or time limit
  and run one after another, which can hold up the PR poll. From STORY-57.
- **CI test reports: re-run detection.** A re-run that finishes within one poll interval is missed; compare the run's
  attempt or `updatedAt` instead of watching for pending. From STORY-57.

- Abandoning a story in a worktree that has no feature: decide where its card goes and test that path.

## Before public release

- A trademark and registrar check on the name "Featra".
- **Help menu links** that need a public repo and a release channel: Featra Docs (F1), View Changelog, Get Support,
  Send Feedback, and Check for Updates.
- **Logo and app icon.** A real Featra logo to replace the placeholder "F" icon (BUG-14). The icon is generated from
  `tooling/icon/icon.svg`, so the new mark replaces that file.
