# Open questions

- Is there demand beyond the author? Success test: a builder can say what remains and what changed in scope without
  asking the orchestrator.
- Domain and trademark availability for "Featra".
- Should a question card have Skip/Decline? Today only Stop declines. Recommendation: later, as a deny with a reason.
  Non-blocking (STORY-46).
- Codex-origin roles show Claude's mode in M1, because every role runs on Claude until a Codex adapter exists.
  Recommendation: show Codex's own mode when the Codex adapter ships (M2). Non-blocking (STORY-6).
- Codex trusted default, narrowed by a check of a real `~/.codex` (2026-11-09): Codex writes `approval_policy` and
  `sandbox_mode` as top-level keys of the user's `config.toml`, and a `[projects.'<path>']` entry holds only
  `trust_level`, keyed by a literal string that may carry the `\?\` long-path prefix and a lower-case drive. Featra
  reads all of that. Still unconfirmed: what Codex runs a trusted project with neither key set; Featra shows
  `on-request` with `workspace-write`. Recommendation: confirm when the Codex adapter ships. Non-blocking (STORY-6).
- A Codex agent's own `sandbox_mode` is not shown or used: every role runs on Claude in M1 and Claude's settings
  name the mode. Recommendation: show it as the role's mode when the Codex adapter ships. Non-blocking (STORY-6).
- No chat knows its card yet, so `log_decision` and `defer_question` take the card as an optional input the agent fills
  when it knows it. Recommendation: have the session record its card when a chat starts from one (FEAT-3), and fill
  `Card:` from that. Non-blocking (STORY-47).
- Under `knowledge: propose` an agent's log goes straight in, with the chat's Undo as the review. Should propose mode
  ask before logging? Recommendation: keep it as it is; asking would stop most decisions being logged at all.
  Non-blocking (STORY-47).
- Undo is unavailable for an entry after the server restarts, and a logged row is not restored into a restored chat's
  history. Recommendation: keep a small ledger beside the chats' store if users ask. Non-blocking (STORY-47).
- No chat has a card until STORY-9 starts chats from one, so the Inbox shows a card only where `chat.start` was given
  one. Recommendation: pass the card from the card pane when STORY-9 lands. Non-blocking (STORY-7).
- Notifications and the Inbox cover the project in front only, so a request in another open project is neither listed
  nor notified. Recommendation: watch every open project once there is a place to show which project it is in.
  Non-blocking (STORY-7).
- The card says "Settings › App"; the settings are in Settings › General, the page for app-wide settings. Recommendation:
  keep them there and read the card's "App" as the app's settings. Non-blocking (STORY-7).
- The placeholder test in `packages/client/test/app.test.tsx` listed Inbox among the views with no page yet; it now skips
  Inbox, as it has one, and asserts the Inbox. That is a changed filter, not a changed assertion. Non-blocking (STORY-7).
