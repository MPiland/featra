export type CardType = "epic" | "feature" | "story" | "bug";

/** Why a card exists. `added` = created after its feature's scope baseline. */
export type Origin = "planned" | "added" | "bug";

/** Lifecycle of epics and features (stories and bugs use the project's stages instead). */
export type ContainerStatus = "draft" | "approved" | "active" | "done" | "cancelled";
export const CONTAINER_STATUSES: readonly ContainerStatus[] = ["draft", "approved", "active", "done", "cancelled"];

/** stories and bugs use project stage names; `Cancelled` is always available. */
export const CANCELLED = "Cancelled";

export type HistoryField =
  | "status"
  | "parent"
  | "evidence"
  | "accepted"
  | "content"
  | "sent-back"
  | "stopped"
  | "queued"
  | "report";
export const HISTORY_FIELDS: readonly HistoryField[] = [
  "status",
  "parent",
  "evidence",
  "accepted",
  "content",
  "sent-back",
  "report",
  "stopped",
  "queued",
];

/** Append-only record of a change, written at the card's owner (ADR 0002). */
export interface HistoryEvent {
  at: string;
  field: HistoryField;
  from: string | null;
  to: string | null;
  /** `user`, or `session:<id>` for agents, or `system` for CI/merge facts. */
  by: string;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface AcceptanceCriterion extends ChecklistItem {
  /** Reference to the test that proves this AC, e.g. `packages/x/test/y.test.ts > name`. */
  test: string | null;
  /** The evidence file an agent linked for this AC, inside the story's evidence folder (STORY-10). Absent when none. */
  evidence?: string;
}

export interface BodySection {
  heading: string;
  content: string;
}

export interface Card {
  id: string;
  type: CardType;
  title: string;
  status: string;
  parent: string | null;
  order: number;
  origin: Origin;
  role: string | null;
  agent: string | null;
  model: string | null;
  reasoning: string | null;
  sessions: string[];
  branch: string | null;
  pr: string | null;
  created: string;
  history: HistoryEvent[];
  description: string;
  acs: AcceptanceCriterion[];
  tasks: ChecklistItem[];
  notes: string;
  /** Unknown body sections, preserved in order after the known ones. */
  extraSections: BodySection[];
  /** Unknown frontmatter keys, preserved on round-trip. */
  extra: Record<string, unknown>;
}

export type StageCategory = "not-started" | "active" | "done";

export interface Stage {
  name: string;
  category: StageCategory;
}

export type ProgressMode = "stories" | "tasks";
export type KnowledgePermission = "edit" | "propose" | "read-only";

export interface ProjectConfig {
  version: number;
  stages: Stage[];
  progress: ProgressMode;
  requireAccept: boolean;
  baseBranch: string;
  worktrees: boolean;
  mcp: boolean;
  autoMerge: boolean;
  uat: boolean;
  knowledge: KnowledgePermission;
  /** The most story sessions that run at once (STORY-9); the rest wait, Queued. */
  maxStoryAgents: number;
}
