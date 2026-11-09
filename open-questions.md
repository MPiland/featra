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
