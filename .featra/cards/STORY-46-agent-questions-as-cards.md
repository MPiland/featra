---
id: STORY-46
type: story
title: Agent questions as cards
status: In Progress
parent: FEAT-3
order: 5
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-46-questions
pr: null
created: 2026-11-08T22:00:00Z
history:
  - at: 2026-11-08T22:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-09T17:24:12Z
    field: status
    from: New
    to: In Progress
    by: session:story-46
---

## Description

As a builder, I answer an agent's question by picking from its options in a card, so the agent gets a clear answer
and keeps going.

## Acceptance criteria

- [ ] An AskUserQuestion call shows as a card with each question, its options (several at once where the agent
  allows it) and an Other field (test: packages/client/test/components/chat-questions.test.tsx > AC1 (each question with its header, options and Other; several options only where the agent allows it; Submit waits for every question); packages/server/test/chat-questions.test.ts > AC1 (the question reaches the chat and canUseTool is held; four questions in one call; questions that can't be shown are asked as an approval); packages/work-format/test/chat-questions.test.ts > AC1 (the questions' shape, the event, the call's summary); apps/desktop/e2e/chat-questions.spec.ts journey)
- [ ] Submitting sends the answers back as the tool's result, and the agent continues the same turn (test: packages/server/test/chat-questions.test.ts > AC2 (the answers go back keyed by question text, several joined; Other text; the same turn goes on with no new message; incomplete answers refused and the question keeps waiting; unknown, repeated and mismatched requests refused; two questions at once; the same question asked again); a question the user never answers (Stop, the chat closing, the SDK cancelling, a stopped turn, the agent failing); packages/server/test/ws-chat-answer.test.ts; packages/client/test/components/chat-questions.test.tsx > AC2 (one choice, several, Other, the keyboard, a refused answer); packages/work-format/test/chat-questions.test.ts > AC2 (the answer's check and params); apps/desktop/e2e/chat-questions.spec.ts journey)
- [ ] An answered card collapses to the chosen answers (test: packages/client/test/components/chat-questions.test.tsx > AC3; packages/server/test/chat-questions.test.ts > AC3; packages/work-format/test/chat-questions.test.ts > AC1, AC3 (the card on the call's row, answered, cancelled, stopped); apps/desktop/e2e/chat-questions.spec.ts journey)
- [ ] A chat waiting on a question is marked waiting (the dot from STORY-21) (test: packages/work-format/test/chat-questions.test.ts > AC4; packages/server/test/chat-questions.test.ts > AC4; packages/client/test/components/chat-questions.test.tsx > AC4; apps/desktop/e2e/chat-questions.spec.ts journey)

## Tasks

- [ ] work-format: question events (`question`, `question-answered`), the tool row's question state, the `question` wait reason, the answer's params and its summary
- [ ] Server: the approval desk holds a question like an approval; the Claude adapter intercepts AskUserQuestion in `canUseTool` and returns the answers as `updatedInput`; Stop and close cancel it
- [ ] Protocol: `chat.answer` answers a question
- [ ] Client: the question card (single and multiple choice, Other, Submit), collapsed to the chosen answers once answered, keyboard reachable
- [ ] Tests: unit (params, fold, waits), server integration through the real adapter (fake `query`), over the socket, client component, one Electron journey
- [ ] ADR 0018 note, CONTEXT.md and decisions.md updated

## Notes

- Depends on: STORY-5, STORY-21. Intercepted through `canUseTool` (docs/spike-claude-sdk.md).
