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

| ADR                                               | Title                                                    | Status   |
| ------------------------------------------------- | -------------------------------------------------------- | -------- |
| [0001](0001-own-ade.md)                           | Build our own ADE rather than a plugin or fork           | accepted |
| [0002](0002-single-card-ownership.md)             | Single card ownership, history inside the card           | accepted |
| [0003](0003-computed-rollups.md)                  | Rollups are computed, never stored                       | accepted |
| [0004](0004-evidence-states.md)                   | Evidence states                                          | accepted |
| [0005](0005-no-forecast.md)                       | No forecast                                              | accepted |
| [0006](0006-mcp-default-on.md)                    | Featra MCP on by default                                 | accepted |
| [0007](0007-claude-via-agent-sdk.md)              | Claude through the Agent SDK and the user's own `claude` | accepted |
| [0008](0008-erasable-typescript.md)               | Erasable TypeScript, no build step for packages          | accepted |
| [0009](0009-linux-supported.md)                   | Linux is a supported M1 platform                         | accepted |
| [0010](0010-agent-tools-via-mcp.md)               | Agent tools through MCP, off by default                  | accepted |
| [0011](0011-package-boundaries.md)                | Package boundaries: pure domain core, UI, platform       | accepted |
| [0012](0012-local-server-and-index.md)            | Local server with a rebuildable SQLite index             | accepted |
| [0013](0013-testing-strategy.md)                  | Tests run real code and fake only the platform           | accepted |
| [0014](0014-quality-gate.md)                      | OXC for lint and format, with a pre-commit quality gate  | accepted |
| [0015](0015-local-server-process-and-protocol.md) | The local server's process model and WebSocket protocol  | accepted |
