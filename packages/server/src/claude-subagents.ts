/**
 * The subagents a Claude session spawns for itself (STORY-55, ADR 0030), told apart from the Agent SDK's one stream. The
 * SDK reports each subagent as a task (`task_started`, `task_updated`, `task_notification`) and, with
 * `forwardSubagentText`, tags every message of its own conversation with the tool call that started it
 * (`parent_tool_use_id`) and its task (`agent_id`). Each subagent gets a translator of its own, so its transcript is the
 * same chat events as any chat's, and the session's translator never sees it.
 *
 * Stop ends one subagent through the query's `stopTask`, and only for a background one: a foreground subagent holds its
 * tool call open, and the SDK ends that only with the whole turn.
 */
import { isRecord, type ChatEvent, type TurnOutcome } from "@featra/work-format";
import { createClaudeTranslator, type ClaudeTranslator } from "./claude-messages.ts";
import type { SubagentEvent } from "./provider.ts";

interface Subagent {
  /** What the session manager knows it by: the tool call that started it, else its task. */
  id: string;
  /** The SDK's task id, once a message has named it: what `stopTask` takes. */
  task: string | null;
  label: string;
  background: boolean;
  translator: ClaudeTranslator;
  ended: boolean;
}

export interface ClaudeSubagents {
  /** Takes a message about a subagent (its task events, its own conversation); false for any other, which is the session's. */
  handle: (message: unknown) => boolean;
  /** The label of the subagent a tool call or question came from (`canUseTool`'s `agentID`), or undefined for the session's own. */
  labelOf: (agent: string | undefined) => string | undefined;
  /** Ends one subagent through the running query; refused when it isn't a background one that is running. */
  stop: (id: string, stopTask: ((task: string) => Promise<unknown>) | undefined) => Promise<void>;
  /** The agent ended: every subagent still running ends with `outcome`. */
  endAll: (outcome: TurnOutcome) => void;
}

const NOT_STOPPABLE = "not stoppable";
const text = (value: unknown): string => (typeof value === "string" && value ? value : "");
const OUTCOMES: Record<string, TurnOutcome> = { completed: "done", failed: "failed", stopped: "stopped" };

/** A subagent's own task, among the SDK's tasks (shell commands, monitors and workflows are not subagents). */
const isSubagentTask = (m: Record<string, unknown>) =>
  !m.skip_transcript && !m.ambient && (m.task_type === "local_agent" || (!m.task_type && text(m.subagent_type) !== ""));

export function createClaudeSubagents(tell: (event: SubagentEvent) => void): ClaudeSubagents {
  const byId = new Map<string, Subagent>();
  const byTask = new Map<string, Subagent>();

  const stoppable = (s: Subagent) => s.background && s.task !== null && !s.ended;

  function begin(id: string, task: string | null, label: string, kind: string | null, background: boolean) {
    const found = byId.get(id);
    // Its messages can come before its task is announced: the announcement then names it.
    if (found) {
      if (task && found.task === null) {
        found.task = task;
        byTask.set(task, found);
      }
      return found;
    }
    const sub: Subagent = {
      id,
      task,
      label,
      background,
      translator: createClaudeTranslator(null, true),
      ended: false,
    };
    byId.set(id, sub);
    if (task) byTask.set(task, sub);
    tell({ type: "started", id, label, kind, stoppable: stoppable(sub) });
    return sub;
  }

  const show = (sub: Subagent, events: ChatEvent[]) => {
    for (const event of events) tell({ type: "event", id: sub.id, event });
  };

  function finish(sub: Subagent, outcome: TurnOutcome, why = "") {
    if (sub.ended) return;
    if (outcome === "failed" && why) show(sub, [{ type: "problem", problem: { type: "failed", message: why } }]);
    sub.ended = true;
    tell({ type: "ended", id: sub.id, outcome });
  }

  /** The subagent a message is from: by its task, else by the tool call that started it; one never announced starts here. */
  function owner(m: Record<string, unknown>): Subagent | null {
    const task = text(m.agent_id);
    const call = text(m.parent_tool_use_id);
    const known = (task && byTask.get(task)) || (call && byId.get(call)) || null;
    if (known) {
      if (task && known.task === null) {
        known.task = task;
        byTask.set(task, known);
      }
      return known;
    }
    const id = call || task;
    return id
      ? begin(id, task || null, text(m.task_description) || text(m.subagent_type) || "Subagent", null, false)
      : null;
  }

  function taskEvent(m: Record<string, unknown>): boolean {
    const task = text(m.task_id);
    if (m.subtype === "task_started") {
      if (!task || !isSubagentTask(m)) return false;
      const call = text(m.tool_use_id);
      const sub = begin(
        call || task,
        task,
        text(m.description) || text(m.subagent_type) || "Subagent",
        text(m.subagent_type) || null,
        m.is_backgrounded === true,
      );
      show(sub, [{ type: "user", text: text(m.prompt) || sub.label }]);
      return true;
    }
    const sub = byTask.get(task);
    if (!sub) return false;
    if (m.subtype === "task_updated" && isRecord(m.patch)) {
      if (typeof m.patch.is_backgrounded === "boolean" && m.patch.is_backgrounded !== sub.background) {
        sub.background = m.patch.is_backgrounded;
        tell({ type: "updated", id: sub.id, stoppable: stoppable(sub) });
      }
      return true;
    }
    if (m.subtype === "task_notification") {
      const outcome = OUTCOMES[text(m.status)] ?? "done";
      finish(sub, outcome, text(m.summary));
      return true;
    }
    return false;
  }

  return {
    handle(message) {
      if (!isRecord(message)) return false;
      if (message.type === "system") return taskEvent(message);
      const own = text(message.parent_tool_use_id) !== "" || text(message.agent_id) !== "";
      if (!own) return false;
      const sub = owner(message);
      if (sub && !sub.ended) show(sub, sub.translator.translate(message));
      return true;
    },
    labelOf(agent) {
      const sub = agent ? byTask.get(agent) : undefined;
      return sub?.label;
    },
    async stop(id, stopTask) {
      const sub = byId.get(id);
      if (!sub || !stopTask || !stoppable(sub) || sub.task === null) throw new Error(NOT_STOPPABLE);
      await stopTask(sub.task);
    },
    endAll(outcome) {
      for (const sub of byId.values()) finish(sub, outcome);
    },
  };
}
