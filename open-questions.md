# Open questions

- Is there demand beyond the author? Success test: a builder can say what remains and what changed in scope without
  asking the orchestrator.
- Domain and trademark availability for "Featra".
- Should a question card have Skip/Decline? Today only Stop declines. Recommendation: later, as a deny with a reason.
  Non-blocking (STORY-46).
- Codex-origin roles show Claude's mode in M1, because every role runs on Claude until a Codex adapter exists.
  Recommendation: show Codex's own mode when the Codex adapter ships (M2). Non-blocking (STORY-6).
- Codex trusted default: a trusted project with neither `approval_policy` nor `sandbox_mode` set is shown as `on-request`
  with `workspace-write`, which is what Featra assumes Codex does. Recommendation: confirm against Codex's documented
  behaviour when the Codex adapter ships. Non-blocking (STORY-6).
