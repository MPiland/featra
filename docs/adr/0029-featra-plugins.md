# 0029 — Featra plugins: sandboxed UI with a permissioned API

Date: 2026-11-11 · Status: proposed (design now, build after M1)

## Context

The user wants anyone to build plugins for Featra that others install, and that are not limited to small things the
way other ADEs (T3 Code, Orca, the Claude desktop app) are. The example is a UX design plugin: its own pane, with its
own buttons, where the user annotates mockups that aren't HTML (images, PDFs, Figma frames) and sends the notes to the
story's agent.

Installing a provider's own plugins (Claude Code plugins and so on) stays as planned. Featra plugins are a second,
separate thing: they extend Featra itself.

## Decision

- **UI.** A plugin can add a full pane, a modal, sidebar views and actions, built however its author wants. Its UI is
  web content in an isolated frame: it can draw anything (images, PDFs, canvas, Figma through its API), but it reaches
  Featra only through the plugin API.
- **API and permissions.** A permissioned Featra API: read and update cards, start and message sessions, read and write
  project files, the Inbox, settings, and network access to named hosts. The user approves each area at install.
  Secrets a plugin needs (a Figma token) are kept by Featra for that plugin only. Plugins never get vendor credential
  files and never write agent instruction files (CLAUDE.md, AGENTS.md).
- **Native tier.** A plugin may ask to run local programs (a parser, a background process, a local model). It's an
  opt-in tier with a clear warning at install, off for marketplace plugins unless the user turns it on.
- **Look.** Featra's components and theme tokens are offered to plugin authors, not forced.
- **Bundles.** A plugin can carry agent pieces too: role presets, and provider parts (Claude and Codex skills, MCP
  servers) for each provider, so it stays provider-neutral.
- **Distribution.** Install from any git repo or URL and from marketplace lists anyone publishes; a curated Featra
  registry can come later.
- **Now.** Until the API is built, new panes, card fields and evidence kinds are built so a plugin could later add one
  the same way (a registry, not hard-coded lists), where that costs little.

## Consequences

Plugins can be as capable as Featra's own panes, without reading what the user didn't grant. The plugin API becomes a
public contract that needs versioning. The isolated frame and the permission prompts are work the build has to carry;
the native tier is the one place a plugin can reach the machine, so it is gated hardest.
