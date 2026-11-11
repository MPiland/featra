# Featra domain language

Terms used across the code, cards and docs. Keep definitions short; link ADRs for the reasoning.

## Work hierarchy

- **Card** — one markdown file in `.featra/` describing a unit of work. Frontmatter holds fields; the body holds
  description, acceptance criteria, tasks and handoff notes.
- **Epic** — a group of related features. Shown as a collapsible header on the home view.
- **Feature** — a user-facing capability. Gets its own git branch while active.
- **Story** — a vertical slice of a feature that delivers one user-visible behavior, written as a user story
  ("As a builder, I…"). Built in its own worktree off the feature branch. Called a PBI (product backlog item) in
  Scrum and Azure DevOps; Featra says "story" because its users are often not engineers.
- **Task** — a checklist item inside a story card's body.
- **AC** (acceptance criterion) — a checklist item on a story that links the test proving it.
- **Bug** — a card for something that broke in already-merged work. A regression caused by the in-progress feature
  lives under that feature; a bug with no in-progress cause lives in the project bug list. A problem inside a story that
  is still being worked is a _task_, not a bug.

## Ownership and history

- **Owner** (owning location) — the single branch or worktree whose copy of a card is authoritative at a given time.
  Drafts/backlog → main; active feature → its feature branch; active story → its worktree; merged story → feature branch;
  merged feature → main. See [ADR 0002](docs/adr/0002-single-card-ownership.md).
- **Card pane** — the full-height pane docked beside the Work list that shows one card from its owner copy and edits
  it a field at a time. Every save goes to the owner copy, and is refused if the owner's value changed meanwhile
  (ADR 0017).
- **Stale copy** — any non-owner copy of a card. Never displayed; an uncommitted edit to it is flagged, to apply to
  the owner or discard (ADR 0016).
- **History event** — an append-only entry in a card's `history[]` (`at`, `from`, `to`, `by`) recording a status or
  scope change (`content` marks an edit to a card's text, with what changed in `to`). Burn-up charts are built from
  these.
- **Draft** — a feature an agent made with `draft_cards`: status `draft`, owned by main, uncommitted, with its stories. The user Approves it (its cards, and every story under it, are committed to main) or Rejects it (they are deleted).
  It names the chat that drafted it (`drafted-by`) and shows in Work with a **Review** badge until it is approved or
  rejected. A later call from that chat updates it in place (ADR 0021). It opens as a card pane docked in that chat,
  and the chat is named for it (ADR 0022).

## Progress

- **Stage** — a story's position in the project's workflow (default: New, Ready, In Progress, In Review, Acceptance,
  Done). Each stage maps to a **stage category**: not started, active, done.
- **Scope baseline** — set when the feature is approved: the time and the stories live then (a feature without one falls back to the moment its first story goes In Progress). Stories not in the stored list are **added scope**.
- **Origin** — why a card exists: `planned`, `added` (after the baseline) or `bug`.
- **Burn-up** — chart of a feature's total scope and done count over time. Featra does not forecast.
- **Evidence state** — what is actually known about a story:
  - **Reported** — an agent said so (ticked a task, moved a stage).
  - **Verified** — the PR's CI checks passed.
  - **Proven** — the AC's linked test passed.
  - **Accepted** — the user signed off.

## Projects

- **Project** — a folder Featra works in, normally holding `.featra/`. Featra keeps a list of known projects; one is
  current, and Work, the chat list and Project settings follow it.
- **Project switcher** — the control at the top of the sidebar that lists known projects and offers New Project…, Open
  Folder… and Project Settings….
- **Featra init** — setting a git repository up for Featra: creating `.featra/config.yaml`, `CONTEXT.md`, `docs/adr/`,
  `decisions.md` and `open-questions.md` where they are missing. It never overwrites a file and never creates or edits
  agent instructions.
- **Project setup** — the one screen in Work that sets a project up in one pass: `git init` if needed, Featra init, the
  knowledge files the user picks, a starter `.gitignore` when there is none, and the project's workflow settings.
  Shown for a project that isn't set up; reopened from Project settings.
- **Local server** — the Node process the app starts beside itself, on 127.0.0.1 only, that does the project work
  (git, files, later the index). The UI reaches it through `FeatraBridge` (ADRs 0012, 0015).

## Agents

- **Session** — one running agent conversation inside Featra (e.g. a Claude Code session via the Agent SDK).
- **Role preset** — an editable prompt template plus agent, model and reasoning choice: Researcher, Analyst/Refiner,
  Dev Lead, Developer, QA.
- **Role** — what a chat starts from: a prompt appended to the agent's own, a model, an effort and a permission mode.
  The five built-in roles are the role presets; all start in Ask.
- **Chat** — a conversation with one agent, started from a role in a project. Its transcript is an event log; a
  **tool row** is one tool call in it, collapsed to the tool and a short summary. Featra keeps a chat's row and its
  provider **session** id in the app's data; the transcript stays in the provider's own session, so a **restored**
  chat reads it back when opened and goes on in the same session. A chat whose session is gone says so.
- **Ask** — the permission mode where every tool that needs approval asks first: the call waits in the chat until the
  user answers **Allow**, **Allow for this chat** or **Deny** (with an optional reason the agent is sent). Allow for
  this chat lasts while the chat's agent runs: a shell command by its exact command, any other tool by its name.
- **Composer controls** — Role, Model, Effort and Mode, picked from the composer in the provider's own names. A change
  applies from the next turn. Full access is offered only to a chat that started in it.
- **Context meter** — the tokens a chat uses of its model's window, read from the session's own events (no extra
  tokens). Without a window from the provider it shows the tokens alone; hidden until the first turn reports usage.
- **Approval** — a tool request the chat waits on; the chat shows the waiting dot. One left unanswered (Stop, the chat
  closing, a restart) is cancelled, never denied.
- **Question** — the agent asks the user to choose in the middle of a turn (Claude's AskUserQuestion): a card on the
  call's row with each question's options (several at once where the agent allows it) and an **Other** field. The chat
  shows the waiting dot until it is answered; the answers go back as the tool's result and the same turn goes on. An
  answered card collapses to the chosen answers.
- **Stopped** — a story whose agent the user stopped: a mark on its Work row and its session, derived from the last
  `stopped` event in the card's history. Stop ends the running turn and keeps the story's stage and worktree; **Resume**
  goes on in the same session and clears the mark. A stopped session doesn't count toward the running-sessions cap.
- **Story session view** — a story's session is read-only: the live transcript (with the agent's thinking, where the
  provider shows it) and no composer; the Dev Lead steers it.
- **Orchestrator** — a session using the Dev Lead role. Shapes features with the user, drafts cards, spawns story
  sessions, reviews and merges.
- **Agent instructions** — the user's own `CLAUDE.md` / `AGENTS.md`. Featra never edits them. Not the same as project
  knowledge (this file, ADRs, decisions).
