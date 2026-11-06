# Roadmap

This file lists ideas that are outside the current milestones. Work that the current scope needs goes in
`.featra/cards/`, not here. When a roadmap item is picked up, it becomes cards and comes off this list.

Current milestones are M1a (prove the core), M1b (automation and review) and M1c (everyday ADE). They're tracked as
epics in `.featra/cards/`.

## M2 and later

- **Remote control** over Tailscale, phone first, reusing the same React client.
- **More providers:** Codex next, then ACP agents.
- **Knowledge:** a generated knowledge index, and an opt-in work protocol.
- **Importers** for BMAD, spec-kit, OpenSpec and GSD.
- **SSH remote compute.**
- **Teams:** shared projects (for example a shared folder or server), and coordination so two people's agents never
  take the same card or story.
- **Rebindable keyboard shortcuts** with conflict detection and per-platform defaults. M1 lists shortcuts read-only in
  Settings.
- **Command palette** (View > Command Palette, Ctrl+K): every menu action and view, searchable.
- **Search** (Go > Search…, Ctrl+Shift+K) across chats and cards.
- **Desktop computer use** for agents: screenshots plus mouse and keyboard control of other apps, offered as MCP tools
  so any agent can use them. Off by default (tool definitions cost tokens), with per-app approval, browsers and
  terminals restricted, and macOS screen-recording and accessibility permissions. Linux under Wayland limits it. M1
  covers browser use only (STORY-40).

## Before public release

- A trademark and registrar check on the name "Featra".
- **Help menu links** that need a public repo and a release channel: Featra Docs (F1), View Changelog, Get Support,
  Send Feedback, and Check for Updates.
