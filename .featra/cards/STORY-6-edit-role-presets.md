---
id: STORY-6
type: story
title: Built-in, custom and provider roles
status: In Review
parent: FEAT-3
order: 6
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-6-roles
pr: 12
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-09T17:56:10Z
    field: status
    from: New
    to: In Progress
    by: session:story-6
  - at: 2026-11-09T20:07:34Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-6
---

## Description

As a builder, I tune the built-in roles, make my own, and use the agent definitions I already have in Claude and
Codex, so every chat starts with the right prompt, model and effort.

## Acceptance criteria

- [ ] Settings › Project › Roles lists the built-in, custom and provider roles, each with its prompt, model, effort
  and permission mode (test: packages/server/test/role-registry.test.ts > lists the five with prompt, model, effort and mode; packages/server/test/ws-roles.test.ts > lists the roles, edits one, and pushes the changed list to the watcher; packages/client/test/components/settings/RolesPage.test.tsx > groups the roles by where they came from, each with its tag, model, effort and mode; packages/client/test/roles-bridge.test.ts > hears the roles with the files that couldn't be read, then each push; apps/desktop/e2e/roles.spec.ts > Roles lists built-in, custom and provider roles)
- [ ] Editing a built-in role writes `.featra/roles/<role>.md`, which overrides it; Reset deletes that file and the
  built-in comes back with Featra's updates (test: packages/server/test/role-registry.test.ts > writes .featra/roles/<role>.md, and chats started after it see the change; packages/server/test/role-registry.test.ts > Reset deletes the file and the built-in comes back; packages/server/test/role-registry.test.ts > reads a hand-edited override live, a missing field keeping the built-in's; packages/client/test/components/settings/RolesPage.test.tsx > saves the prompt with the role's model and effort; packages/client/test/components/settings/RolesPage.test.tsx > offers Reset only for an edited built-in; apps/desktop/e2e/roles.spec.ts > Roles lists built-in, custom and provider roles)
- [ ] Custom roles can be created, duplicated, renamed and deleted; each is a file in `.featra/roles/` (test: packages/server/test/role-registry.test.ts > creates, duplicates, renames and deletes, each as a file in .featra/roles; packages/server/test/role-registry.test.ts > refuses a blank, overlong or taken name, however it is spelled, and writes nothing; packages/server/test/role-registry.test.ts > gives colliding names distinct ids; packages/client/test/components/settings/RolesPage.test.tsx > deletes a custom role only after it is confirmed; packages/client/test/components/settings/RolesPage.test.tsx > renames a custom role in place; apps/desktop/e2e/roles.spec.ts > Roles lists built-in, custom and provider roles)
- [ ] Claude's `.claude/agents/*.md` and Codex's `.codex/agents/*.toml` (project and user) appear as roles tagged with
  their source and read live, so a change to the file shows without a restart. Featra never writes to them; Customize
  copies one into `.featra/roles/` (test: packages/server/test/role-registry.test.ts > lists Claude and Codex agents from the project and the user, tagged with their source; packages/server/test/role-registry.test.ts > reads them live, and never writes them; packages/server/test/role-registry.test.ts > Customize copies the role into .featra/roles as a custom role; packages/server/test/role-registry.test.ts > never reads the providers' credential files; packages/server/test/role-watch.test.ts > shows a Claude agent made in a .claude folder that didn't exist; packages/client/test/components/settings/RolesPage.test.tsx > shows a Claude and a Codex agent tagged with the source; apps/desktop/e2e/roles.spec.ts > Roles lists built-in, custom and provider roles)
- [ ] A role from another provider starts a Claude session with its prompt; a model Claude doesn't have falls back to
  Claude's default with a one-line note (test: packages/server/test/ws-roles.test.ts > starts a Claude session from a Codex agent, with its prompt, Claude's default model and a note; packages/server/test/role-registry.test.ts > falls back to Claude's default for a model it doesn't have, with a one-line note; packages/client/test/components/chat-mode.test.tsx > shows the note under the header; apps/desktop/e2e/roles.spec.ts > a Claude agent with full access shows a warning in its chat)
- [ ] Changes apply to chats started afterwards (test: packages/server/test/role-registry.test.ts > writes .featra/roles/<role>.md, and chats started after it see the change; apps/desktop/e2e/roles.spec.ts > Roles lists built-in, custom and provider roles)
- [ ] A role starts in the permission mode the provider's own settings already use (Claude's
  `permissions.defaultMode`; Codex's `approval_policy` and `sandbox_mode`, and its trusted-project entry), project or
  user level, read live and never written; with no setting it starts on Ask. A full-access mode is honoured and shows
  a warning mark in the composer. The composer's mode picker uses the provider's own mode names and shows where the
  mode came from ("auto · from Claude settings") (test: packages/work-format/test/role-modes.test.ts > all; packages/work-format/test/role-files.test.ts > all; packages/server/test/role-modes.test.ts > the mode a role starts in (AC6, AC7); packages/server/test/role-modes.test.ts > Codex's settings (AC7); packages/server/test/ws-roles.test.ts > tells a chat watcher the mode from the provider's settings; packages/client/test/components/chat-mode.test.tsx > AC7: the picker and the chat name the provider's mode and its source; packages/client/test/components/chat-mode.test.tsx > AC6: full access is honoured and marked in the composer; apps/desktop/e2e/roles.spec.ts > Roles lists built-in, custom and provider roles; apps/desktop/e2e/roles.spec.ts > a Claude agent with full access shows a warning in its chat)

## Tasks

- [x] Role files, provider agent readers and the settings readers in work-format and the server
- [x] Role registry, edit actions and live watch; `roles.watch` and `roles.edit` over the socket
- [x] The chat starts in the mode Claude's settings name, and carries the note
- [x] Settings > Project > Roles page and editor; the mode, warning mark and note in the chat views
- [x] Playwright journey, decisions, ADR note and AC links

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
