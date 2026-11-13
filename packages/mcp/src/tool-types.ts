/** The shapes every tool shares: what the host offers, what a tool is, and how it refuses. */
import type {
  BugReport,
  DraftInput,
  DraftResult,
  LoggedEntry,
  LogInput,
  MessageInput,
  ProposeInput,
  ReportInput,
  RequestMergeInput,
  SpawnInput,
} from "@featra/work-format";

/** What the tools reach the server through. */
export interface FeatraHost {
  /** Adds an entry to the chat's `decisions.md` or `open-questions.md`. */
  log: (input: LogInput) => Promise<LoggedEntry>;
  /** Drafts a feature and its stories, or revises the chat's open draft in place (STORY-8). */
  draft: (input: DraftInput) => Promise<DraftResult>;
  /** Starts an approved feature: its branch, with the feature active on it (STORY-52). */
  start: (feature: string) => Promise<{ branch: string }>;
  /** Starts a story's agent in its own worktree, nested under this chat; queued when the project is at its limit (STORY-9). */
  spawn: (input: SpawnInput) => Promise<{ chat: string; queued: boolean }>;
  /** Reports progress on a card: the stage, ticks, tasks, a note and evidence links, all Reported (STORY-10). */
  update: (input: ReportInput) => Promise<{ card: string; changes: string[] }>;
  /** The Dev Lead tells a story's session something, as its next turn (STORY-54). */
  message: (input: MessageInput) => Promise<{ story: string }>;
  /** The Dev Lead proposes the check command and linked-test command; the user confirms them in settings (STORY-56). */
  propose: (input: ProposeInput) => Promise<{ proposed: string[] }>;
  /** The Dev Lead asks the user to merge a story into its feature; answers once the user is asked (STORY-12). */
  requestMerge: (input: RequestMergeInput) => Promise<{ story: string }>;
  /** The Dev Lead reports a bug for the user to place; answers once the user is asked (STORY-13). */
  reportBug: (input: BugReport) => Promise<{ asked: true }>;
}

export interface Tool {
  name: string;
  description: string;
  /** JSON Schema of the input, as an agent sees it. */
  inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] };
  /** Runs the call; throws a `ToolRefusal` for input to fix. Resolves with the line the agent is told. */
  run: (input: unknown, host: FeatraHost) => Promise<string>;
  /** What a failure that isn't a refusal (the server said no, or is gone) starts with. Default: "Not logged." */
  failed?: string;
}

/** A call that can't be done as given: the message tells the agent what to fix. */
export class ToolRefusal extends Error {}
