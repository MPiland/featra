# Roadmap

This file lists ideas that are outside the current milestones. Work that the current scope needs goes in
`.featra/cards/`, not here. When a roadmap item is picked up, it becomes cards and comes off this list.

Current milestones are M1a (prove the core), M1b (automation and review) and M1c (everyday ADE). They're tracked as
epics in `.featra/cards/`.

## M2 and later

- **Remote control** (MVP), phone first, reusing the same React client against the local server. Over Tailscale
  (for example Tailscale Serve, reachable only inside the tailnet), with an SSH tunnel to the server as an alternative
  for users without Tailscale. Featra never exposes a public port, and it keeps nothing hosted. It does not rely on
  vendors' own remote-control features: imported sessions are resumed in place, so they carry over to the vendor's CLI the
  way they do natively.
- **Keep queued story sessions across a restart** (FEAT-5 keeps the queue in memory), or tell the Dev Lead the
  queue was cleared.
  The same goes for story notices held for a busy Dev Lead: they live in memory and are lost across a restart (accepted
  for STORY-54).
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

## Before public release

- A trademark and registrar check on the name "Featra".
- **Help menu links** that need a public repo and a release channel: Featra Docs (F1), View Changelog, Get Support,
  Send Feedback, and Check for Updates.
- **Logo and app icon.** A real Featra logo to replace the placeholder "F" icon (BUG-14). The icon is generated from
  `tooling/icon/icon.svg`, so the new mark replaces that file.
