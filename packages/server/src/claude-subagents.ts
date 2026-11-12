/**
 * The subagents a Claude session spawns for itself (STORY-55, ADR 0030), told apart from the Agent SDK's one stream. The
 * SDK reports each subagent as a task (`task_started`, `task_updated`, `task_notification`) and, with
 * `forwardSubagentText`, tags every message of its own conversation with the tool call that started it
 * (`parent_tool_use_id`) and its task (`agent_id`). Each subagent gets a translator of its own, so its transcript is the
 * same chat events as any chat's, and the session's translator never sees it.
 *
 * A subagent is known by its task id; the tool call that started it is an alias, for messages that name only that. Stop
 * ends one subagent through the query's `stopTask`, and only a background one: a foreground subagent holds its tool call
 * open, and the SDK ends that only with the whole turn, which is when this ends it too. An ended subagent stays known
 * (a resumed task reopens it) until it is archived or older ended ones push it out.
 */
import { isRecord, MAX_ENDED_SUBAGENTS, type ChatEvent, type TurnOutcome } from "@featra/work-format";
import { createClaudeTranslator, type ClaudeTranslator } from "./claude-messages.ts";
import type { SubagentEvent } from "./provider.ts";

interface Subagent {
  /** What the session manager knows it by: its task id, or the tool call that started it when no message named its task. */
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
  /** Ends every running background subagent through the query (the session's Stop); one that can't be ended is skipped. */
  stopAll: (stopTask: ((task: string) => Promise<unknown>) | undefined) => Promise<void>;
  /** The session's turn ended: every subagent still running in the foreground ends with it, with `outcome`. */
  turnEnded: (outcome: TurnOutcome) => void;
  /** The agent ended: every subagent still running ends with `outcome`. */
  endAll: (outcome: TurnOutcome) => void;
  /** The user archived an ended subagent: it is forgotten. */
  forget: (id: string) => void;
}

const NOT_STOPPABLE = "not stoppable";
const text = (value: unknown): string => (typeof value === "string" && value ? value : "");
const OUTCOMES: Record<string, TurnOutcome> = { completed: "done", failed: "failed", stopped: "stopped" };
/** What `task_updated`'s `patch.status` says of a task that is over. */
const ENDED: Record<string, TurnOutcome> = { completed: "done", failed: "failed", killed: "stopped" };

/** A subagent's own task, among the SDK's tasks (shell commands, monitors and workflows are not subagents). */
const isSubagentTask = (m: Record<string, unknown>) =>
  !m.skip_transcript && !m.ambient && (m.task_type === "local_agent" || (!m.task_type && text(m.subagent_type) !== ""));

export function createClaudeSubagents(tell: (event: SubagentEvent) => void): ClaudeSubagents {
  const subs = new Set<Subagent>();
  const byTask = new Map<string, Subagent>();
  const byCall = new Map<string, Subagent>();
  /** Tasks and calls that are not subagents (a shell task's own messages must not make a chat). */
  const others = new Set<string>();
  /** Tasks and calls of subagents that were archived or pushed out: their late messages make no chat of their own. */
  const gone = new Set<string>();
  /** Ended subagents, oldest first. */
  const ended: Subagent[] = [];

  const stoppable = (s: Subagent) => s.background && s.task !== null && !s.ended;

  function alias(sub: Subagent, task: string, call: string) {
    if (task) {
      sub.task ??= task;
      byTask.set(task, sub);
    }
    if (call) byCall.set(call, sub);
  }

  const drop = (sub: Subagent) => {
    subs.delete(sub);
    for (const map of [byTask, byCall])
      for (const [key, value] of map)
        if (value === sub) {
          map.delete(key);
          gone.add(key);
        }
    const at = ended.indexOf(sub);
    if (at >= 0) ended.splice(at, 1);
  };

  const show = (sub: Subagent, events: ChatEvent[]) => {
    for (const event of events) tell({ type: "event", id: sub.id, event });
  };

  function finish(sub: Subagent, outcome: TurnOutcome, why = "") {
    if (sub.ended) return;
    if (outcome === "failed" && why) show(sub, [{ type: "problem", problem: { type: "failed", message: why } }]);
    sub.ended = true;
    ended.push(sub);
    tell({ type: "ended", id: sub.id, outcome });
    // The oldest ended go first, as the session manager's own list drops them.
    for (let oldest = ended[0]; oldest && ended.length > MAX_ENDED_SUBAGENTS; oldest = ended[0]) drop(oldest);
  }

  function create(task: string, call: string, label: string, kind: string | null, background: boolean) {
    const sub: Subagent = {
      id: task || call,
      task: task || null,
      label,
      background,
      translator: createClaudeTranslator(null, true),
      ended: false,
    };
    subs.add(sub);
    alias(sub, task, call);
    tell({ type: "started", id: sub.id, label, kind, stoppable: stoppable(sub) });
    return sub;
  }

  /** The subagent a message is from: by its task, else by the tool call that started it; one never announced starts here. */
  function owner(m: Record<string, unknown>): Subagent | null {
    const task = text(m.agent_id);
    const call = text(m.parent_tool_use_id);
    if (
      (task && others.has(task)) ||
      (call && others.has(call)) ||
      (task && gone.has(task)) ||
      (call && gone.has(call))
    )
      return null;
    const known = (task && byTask.get(task)) || (call && byCall.get(call)) || null;
    if (known) {
      // A message naming both lets each name stand for the subagent from then on.
      alias(known, task, call);
      return known;
    }
    if (!task && !call) return null;
    return create(task, call, text(m.task_description) || text(m.subagent_type) || "Subagent", null, false);
  }

  function taskStarted(m: Record<string, unknown>, task: string): boolean {
    const call = text(m.tool_use_id);
    if (!isSubagentTask(m)) {
      others.add(task);
      if (call) others.add(call);
      return false;
    }
    gone.delete(task);
    if (call) gone.delete(call);
    const label = text(m.description) || text(m.subagent_type) || "Subagent";
    const kind = text(m.subagent_type) || null;
    const background = m.is_backgrounded === true;
    const found = byTask.get(task) ?? (call ? byCall.get(call) : undefined);
    let sub: Subagent;
    if (!found) sub = create(task, call, label, kind, background);
    else {
      sub = found;
      alias(sub, task, call);
      sub.label = label;
      sub.background = background;
      if (sub.ended) {
        // The same task running again (a resumed subagent): its chat opens again, with its log.
        sub.ended = false;
        ended.splice(ended.indexOf(sub), 1);
        tell({ type: "started", id: sub.id, label, kind, stoppable: stoppable(sub) });
      } else {
        // Its messages came first: the announcement now says what it is.
        tell({ type: "updated", id: sub.id, label, kind, stoppable: stoppable(sub) });
      }
    }
    show(sub, [{ type: "user", text: text(m.prompt) || sub.label }]);
    return true;
  }

  function taskEvent(m: Record<string, unknown>): boolean {
    const task = text(m.task_id);
    if (!task) return false;
    if (m.subtype === "task_started") return taskStarted(m, task);
    if (others.has(task)) return false;
    const sub = byTask.get(task);
    if (!sub) return false;
    if (m.subtype === "task_updated" && isRecord(m.patch)) {
      const over = ENDED[text(m.patch.status)];
      if (typeof m.patch.is_backgrounded === "boolean" && m.patch.is_backgrounded !== sub.background) {
        sub.background = m.patch.is_backgrounded;
        if (!sub.ended) tell({ type: "updated", id: sub.id, stoppable: stoppable(sub) });
      }
      if (over) finish(sub, over);
      return true;
    }
    if (m.subtype === "task_notification") {
      finish(sub, OUTCOMES[text(m.status)] ?? "done", text(m.summary));
      return true;
    }
    return false;
  }

  const running = () => [...subs].filter((s) => !s.ended);

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
      return agent ? byTask.get(agent)?.label : undefined;
    },
    async stop(id, stopTask) {
      const sub = [...subs].find((s) => s.id === id);
      if (!sub || !stopTask || !stoppable(sub) || sub.task === null) throw new Error(NOT_STOPPABLE);
      await stopTask(sub.task);
    },
    async stopAll(stopTask) {
      if (!stopTask) return;
      const tasks = running().flatMap((s) => (stoppable(s) && s.task !== null ? [s.task] : []));
      await Promise.allSettled(tasks.map((task) => stopTask(task)));
    },
    turnEnded(outcome) {
      for (const sub of running()) if (!sub.background) finish(sub, outcome);
    },
    endAll(outcome) {
      for (const sub of running()) finish(sub, outcome);
    },
    forget(id) {
      const sub = [...subs].find((s) => s.id === id);
      if (sub?.ended) drop(sub);
    },
  };
}
