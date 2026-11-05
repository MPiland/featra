# Featra domain language

Terms used across the code, cards and docs. Keep definitions short; link ADRs for the reasoning.

## Work hierarchy

- **Card** — one markdown file in `.featra/` describing a unit of work. Frontmatter holds fields; the body holds
  description, acceptance criteria, tasks and handoff notes.
- **Epic** — a group of related features. Shown as a collapsible header on the home view.
- **Feature** — a user-facing capability. Gets its own git branch while active.
- **PBI** (product backlog item) — a vertical slice of a feature that delivers one user-visible behavior. Built in its
  own worktree off the feature branch.
- **Task** — a checklist item inside a PBI card's body.
- **AC** (acceptance criterion) — a checklist item on a PBI that links the test proving it.
- **Bug** — a card for something that broke in already-merged work. A regression caused by the in-progress feature
  lives under that feature; a bug with no in-progress cause lives in the project bug list. A problem inside a PBI that
  is still being worked is a *task*, not a bug.

## Ownership and history

- **Owner** (owning location) — the single branch or worktree whose copy of a card is authoritative at a given time.
  Drafts/backlog → main; active feature → its feature branch; active PBI → its worktree; merged PBI → feature branch;
  merged feature → main. See [ADR 0002](docs/adr/0002-single-card-ownership.md).
- **Stale copy** — any non-owner copy of a card. Never displayed; edits to it are flagged.
- **History event** — an append-only entry in a card's `history[]` (`at`, `from`, `to`, `by`) recording a status or
  scope change. Burn-up charts are built from these.

## Progress

- **Stage** — a PBI's position in the project's workflow (default: New, Ready, In Progress, In Review, Acceptance,
  Done). Each stage maps to a **stage category**: not started, active, done.
- **Scope baseline** — the moment a feature's first PBI goes In Progress. Items added after it are **added scope**.
- **Origin** — why a card exists: `planned`, `added` (after the baseline) or `bug`.
- **Burn-up** — chart of a feature's total scope and done count over time. Featra does not forecast.
- **Evidence state** — what is actually known about a PBI:
  - **Reported** — an agent said so (ticked a task, moved a stage).
  - **Verified** — the PR's CI checks passed.
  - **Proven** — the AC's linked test passed.
  - **Accepted** — the user signed off.

## Agents

- **Session** — one running agent conversation inside Featra (e.g. a Claude Code session via the Agent SDK).
- **Role preset** — an editable prompt template plus agent, model and reasoning choice: Researcher, Analyst/Refiner,
  Dev Lead, Developer, QA.
- **Orchestrator** — a session using the Dev Lead role. Shapes features with the user, drafts cards, spawns PBI
  sessions, reviews and merges.
- **Agent instructions** — the user's own `CLAUDE.md` / `AGENTS.md`. Featra never edits them. Not the same as project
  knowledge (this file, ADRs, decisions).
