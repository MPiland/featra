/** What an agent is told when a Featra MCP call is refused (STORY-47 on). */
export const AGENT_MESSAGES = {
  mcpOff: "Featra MCP is off for this project.",
  readOnly: "Logging is off: this project's knowledge setting is read-only.",
  draftReadOnly: "Drafting is off: this project's knowledge setting is read-only.",
  noDrafts: "Drafting cards isn't available.",
  startReadOnly: "Starting is off: this project's knowledge setting is read-only.",
  noStart: "Starting a feature isn't available.",
  spawnReadOnly: "Starting a story is off: this project's knowledge setting is read-only.",
  noSpawn: "Starting a story isn't available.",
  updateReadOnly: "Updating cards is off: this project's knowledge setting is read-only.",
  noUpdate: "Updating cards isn't available.",
  noMessage: "Messaging a story isn't available.",
  noPropose: "Proposing a check command isn't available.",
  noMerge: "Asking to merge a story isn't available.",
  /** Checks are the project's to set up; a story session builds, it does not choose how it is judged. */
  sessionPropose: "A story session can't propose check commands. Ask the Dev Lead.",
  /** A story session reports to its Dev Lead and is steered by it; it does not message sessions. */
  sessionMessage: "A story session can't message other story sessions. Ask the Dev Lead.",
  /** A story session is a worker: only the Dev Lead's chat puts agents on stories. */
  sessionSpawn: "A story session can't start other story sessions. Ask the Dev Lead.",
  /** A story session's work is reviewed, not merged on its own word. */
  sessionMerge: "A story session can't ask to merge. Ask the Dev Lead.",
  noBug: "Reporting a bug isn't available.",
  /** A story session tells its Dev Lead what it found; the Dev Lead proposes where the bug goes. */
  sessionBug: "A story session can't report bugs. Tell the Dev Lead what you found.",
} as const;
