# Architecture decision records

An ADR records one architecturally significant decision: one that's hard to reverse, changes a package boundary or a
dependency, or that a future contributor would reasonably question. Smaller decisions go in `decisions.md`.

## Writing one

- Copy the template below to `NNNN-short-title.md`, using the next number.
- Status is `proposed`, `accepted`, `superseded by NNNN` or `deprecated`. Never edit an accepted ADR's decision. Write a
  new ADR that supersedes it, and update the old one's status line.
- Add it to the index.

```markdown
# NNNN — Title

Date: YYYY-MM-DD · Status: proposed

## Context

What forces are at play, and what options were considered.

## Decision

What we're doing.

## Consequences

What becomes easier or harder, and what we must now do.
```

## Index

| ADR                                                       | Title                                                                 | Status   |
| --------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| [0001](0001-own-ade.md)                                   | Build our own ADE rather than a plugin or fork                        | accepted |
| [0002](0002-single-card-ownership.md)                     | Single card ownership, history inside the card                        | accepted |
| [0003](0003-computed-rollups.md)                          | Rollups are computed, never stored                                    | accepted |
| [0004](0004-evidence-states.md)                           | Evidence states                                                       | accepted |
| [0005](0005-no-forecast.md)                               | No forecast                                                           | accepted |
| [0006](0006-mcp-default-on.md)                            | Featra MCP on by default                                              | accepted |
| [0007](0007-claude-via-agent-sdk.md)                      | Claude through the Agent SDK and the user's own `claude`              | accepted |
| [0008](0008-erasable-typescript.md)                       | Erasable TypeScript, no build step for packages                       | accepted |
| [0009](0009-linux-supported.md)                           | Linux is a supported M1 platform                                      | accepted |
| [0010](0010-agent-tools-via-mcp.md)                       | Agent tools through MCP, off by default                               | accepted |
| [0011](0011-package-boundaries.md)                        | Package boundaries: pure domain core, UI, platform                    | accepted |
| [0012](0012-local-server-and-index.md)                    | Local server with a rebuildable SQLite index                          | accepted |
| [0013](0013-testing-strategy.md)                          | Tests run real code and fake only the platform                        | accepted |
| [0014](0014-quality-gate.md)                              | OXC for lint and format, with a pre-commit quality gate               | accepted |
| [0015](0015-local-server-process-and-protocol.md)         | The local server's process model and WebSocket protocol               | accepted |
| [0016](0016-work-list-owner-copies.md)                    | The Work list from owner copies                                       | accepted |
| [0017](0017-card-pane-edits-owner-copy.md)                | The card pane edits the owner copy                                    | accepted |
| [0018](0018-chat-sessions-and-providers.md)               | Chats: a session manager in the server, behind provider adapters      | accepted |
| [0019](0019-agent-socket-and-scoped-secrets.md)           | The Featra MCP reaches the server over a narrow agent socket          | accepted |
| [0020](0020-composer-controls-and-context-meter.md)       | Composer controls and the context meter                               | accepted |
| [0021](0021-agents-draft-cards-through-the-mcp.md)        | Agents draft cards through the MCP; a later call updates in place     | accepted |
| [0022](0022-review-a-draft-in-its-chat.md)                | A draft is reviewed in its chat, as a docked card pane                | accepted |
| [0023](0023-approve-commits-a-draft-reject-deletes-it.md) | Approve commits a draft's cards, all or nothing; Reject deletes       | accepted |
| [0024](0024-start-creates-the-feature-branch.md)          | Start creates the feature's branch; ownership moves to it             | accepted |
| [0025](0025-story-sessions-in-worktrees.md)               | Story agents are Featra-run sessions, each in its own worktree        | accepted |
| [0026](0026-stop-and-resume-story-agents.md)              | Watching, stopping and resuming a story agent                         | accepted |
| [0027](0027-agents-report-on-their-card.md)               | Agents report on their card with `update_card`; only Reported         | accepted |
| [0028](0028-story-agents-report-to-the-dev-lead.md)       | Story agents report to the Dev Lead; it steers with `message_session` | accepted |
| [0029](0029-featra-plugins.md)                            | Featra plugins: sandboxed UI with a permissioned API                  | proposed |
| [0030](0030-native-subagents-nested.md)                   | Native subagents are read-only chats nested under their session       | accepted |
| [0031](0031-local-checks.md)                              | Checks run on this computer, or in CI                                 | proposed |
