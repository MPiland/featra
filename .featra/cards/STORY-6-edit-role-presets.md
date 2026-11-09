---
id: STORY-6
type: story
title: Built-in, custom and provider roles
status: New
parent: FEAT-3
order: 6
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I tune the built-in roles, make my own, and use the agent definitions I already have in Claude and
Codex, so every chat starts with the right prompt, model and effort.

## Acceptance criteria

- [ ] Settings › Project › Roles lists the built-in, custom and provider roles, each with its prompt, model, effort
  and permission mode
- [ ] Editing a built-in role writes `.featra/roles/<role>.md`, which overrides it; Reset deletes that file and the
  built-in comes back with Featra's updates
- [ ] Custom roles can be created, duplicated, renamed and deleted; each is a file in `.featra/roles/`
- [ ] Claude's `.claude/agents/*.md` and Codex's `.codex/agents/*.toml` (project and user) appear as roles tagged with
  their source and read live, so a change to the file shows without a restart. Featra never writes to them; Customize
  copies one into `.featra/roles/`
- [ ] A role from another provider starts a Claude session with its prompt; a model Claude doesn't have falls back to
  Claude's default with a one-line note
- [ ] Changes apply to chats started afterwards
- [ ] A role starts in the permission mode the provider's own settings already use (Claude's
  `permissions.defaultMode`; Codex's `approval_policy` and `sandbox_mode`, and its trusted-project entry), project or
  user level, read live and never written; with no setting it starts on Ask. A full-access mode is honoured and shows
  a warning mark in the composer. The composer's mode picker uses the provider's own mode names and shows where the
  mode came from ("auto · from Claude settings")

## Tasks

- [ ] Break down when picked up

## Notes

- Depends on: STORY-5.
- Decisions 2026-11-08: roles live in committed `.featra/roles/`; built-ins stay built in until edited; provider
  roles are read live through one reader per provider; the Claude and Codex readers ship in M1. Other providers get a
  reader when they document an agent format.
- Real Claude and Codex definitions on the user's PC can be used to check the formats. Never read credential files
  (`~/.claude/.credentials.json`, `~/.codex/auth.json`).
- Decisions 2026-11-09 (decisions.md, "Role permission modes start from the provider's own settings"): the provider's
  settings pick a role's starting permission mode, and project and user settings both count. Featra reads them live
  and never writes them. Full-access modes (Claude `bypassPermissions`; Codex `never` with `danger-full-access`) are
  honoured with a warning mark; built-in roles never start in one on their own. STORY-45's built-in default of Ask
  stands when no setting is found.
- Decision 2026-11-09: the composer's mode picker uses each provider's own mode names: Claude's `default`,
  `acceptEdits`, `plan`, `auto` and `bypassPermissions`; Codex's approval policy plus sandbox. It shows where the mode
  came from ("auto · from Claude settings"). There is no Featra-wide common set of modes.
