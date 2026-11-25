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

- Work filter chips apply to the project bug list.
- request_merge reports "cancelled" when the asking chat ends before the user answers.
- Notices about a request reach the Dev Lead even after its chat has ended.

- A feature merged to main with git outside Featra in local mode becomes Done.

- The Scope cell's tooltip lists the added items' titles and origins.
- The burn-up marks the scope baseline (the moment the feature went in progress).
- The burn-up redraws at local midnight when the pane is left open and nothing else changes.
- Task ticks recorded in the history, so a tasks-mode burn-up shows when each task was ticked, not only now.

- One "leads a feature" rule in work-format, used by the server (`leadOf`, card reports) and the client (`featuresLedBy`).
- A feature picker in the chat header when a chat leads more than one feature.

- A done or cancelled feature's burn-up ends at the moment it finished instead of running flat to now.
- The burn-up's screen-reader table summarises by week for long features.
- Remove a project's remembered board layout when the project is removed from the app.
- Remember the board's feature filter per project.
- Show the stale-copy mark on board cards, as list rows do.
- Optional WIP limits or age per board column.
- One shared card-file writer for every Featra write path (atomic, through the lane, retrying a busy rename), with a lint rule against a bare writeFile to .featra/cards. It finds where to write through one "writable owner" lookup that every card writer uses, which refuses when the shown copy isn't the owner's.
- Show a card that is unreadable only for a moment as being written, not as a problem: the owner's last copy, marked as being written, instead of a fall back to a copy that isn't the owner's.
- After two failed scans, look again later with a backoff, so a kept problem clears without waiting for a file event.
- Hide the one-scan flash ("isn't in its owner", "Can't read", or the pre-Start status) for a worktree that Start is still making.
- Decide whether the branch-name fallback in branchStateOf should wait until the worktree has a card file, so a bare git worktree add outside Featra doesn't take ownership.
- Fast, non-Electron tests for shared e2e helpers.
- Let `run()` in `tooling/test/run.ts` take paths with spaces (it passes one command line to the shell).
- Leave the design-review screens out of the e2e traces artifact; they are uploaded on their own too.
- Fewer git and `gh` starts per server test (fixture repositories copied, not built with git each time; one fake `gh`
  process), so the unit run on a busy PC takes minutes. Under load, BUG-28 measured the server suite at 45 minutes or
  more, nearly all of it process starts.
- Manual Merge of a story under a Cancelled feature: decide whether to refuse it (auto-merge already skips it).
- Show when a feature is waiting on the user's Accept, computed rather than stored as a status. Today Accept appears only in the feature's card pane, once every story and bug is Done or Cancelled. Show an "Awaiting your Accept" mark on the feature's Work row and an Inbox item at that point.
- Keep a Work story row's meta line on one line at Acceptance. With the card pane open at 1280 px, Session, Accept,
  Send back and Hold push "· Reported" onto a second line (STORY-73 visual review).
- **macOS minimize and restore in e2e.** STORY-63 skips the minimize/restore journey on macOS; cover the native
  traffic lights' minimize and a Dock restore there.
- More installer formats after the first installers (FEAT-19): deb and rpm on Linux, and arm64 builds for Windows and Linux.
- **A direct `claude` driver.** The installers bundle Anthropic's Agent SDK under Anthropic's terms, as T3 Code does
  (decisions.md, STORY-64). If Anthropic objects, replace the SDK with Featra's own driver that runs `claude` in its
  stream-json mode, behind the same provider adapter, so no Anthropic code ships.

- **Add to a chosen answer.** On a question card, each option can take a short note, so the user can answer "this,
  and also …" without picking Other and retyping the recommended option. The note goes to the agent with the choice.
  Raised by the user on 2026-11-23.

## Before public release

- A trademark and registrar check on the name "Featra".
- **Help menu links** that need a public repo and a release channel: Featra Docs (F1), View Changelog, Get Support,
  Send Feedback, and Check for Updates.
- **Logo and app icon.** A real Featra logo to replace the placeholder "F" icon (BUG-14). The icon is generated from
  `tooling/icon/icon.svg`, so the new mark replaces that file.
- **Signed installers.** Sign and notarize the macOS app (Apple Developer ID) and sign the Windows installer, so they
  install without Gatekeeper or SmartScreen warnings. The first installers are unsigned (decisions.md, 2026-11-17).
