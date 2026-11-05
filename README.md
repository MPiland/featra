# Featra

**Run your AI coding agents like a product team.**

Featra is a free, open-source (MIT) desktop app for building software with AI coding agents. Agent sessions run
inside it on your own logged-in CLIs (Claude Code first; Codex and ACP agents later). You work like a product
manager: an orchestrator agent acting as dev lead turns your conversations into features and backlog items (PBIs),
delegates them to sub-sessions in their own git worktrees, and Featra shows you where every feature really stands.

## What makes it different

- **A view of the work, not just the sessions.** The home screen is a feature list: which PBIs are moving, how many
  are done, what was added after work started, and which bugs the feature caused.
- **Evidence, not reports.** An agent ticking a box is *reported*; green CI is *verified*; a passing acceptance test
  is *proven*; your sign-off is *accepted*. Featra shows which one you actually have.
- **Markdown cards in your repo.** Every epic, feature, PBI and bug is a markdown file in `.featra/`, committed with
  your code and cheap for agents to read and update.
- **No forced flow, no ceremony.** No sprints, no estimates, no forecasts. Automations are settings.
- **Zero token overhead** for app features. Featra never reads your agent CLIs' credential files.

## Status

Early development. See the [M1 backlog](.featra/) (Featra tracks its own work in Featra's card format) and the
[architecture decisions](docs/adr/).

## Development

Requires Node 24+ and pnpm.

```bash
pnpm install
pnpm test
```

## License

[MIT](LICENSE)
