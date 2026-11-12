/**
 * The Agent SDK's `canUseTool` for a Featra chat (ADR 0018): every tool call that needs approval, and every question the
 * agent asks (STORY-46), goes to the user through the session's `approve` and `ask`, and the answer goes back to Claude.
 * A request a subagent of the session makes (`agentID`, STORY-55) says which subagent asked.
 */
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeSubagents } from "./claude-subagents.ts";
import { claudeQuestions, questionResult } from "./claude-question.ts";
import { sessionRules, suggestedRule } from "./claude-rules.ts";
import type { SessionOptions } from "./provider.ts";

export interface ApprovalHost {
  subagents: ClaudeSubagents;
  approve: SessionOptions["approve"];
  ask: SessionOptions["ask"];
  /** The signal of the turn now running: its Stop ends the request that waits. */
  signal: () => AbortSignal;
}

export function claudeCanUseTool({ subagents, approve, ask, signal: turn }: ApprovalHost): CanUseTool {
  return async (name, toolInput, options) => {
    const { signal, toolUseID, suppressAlwaysAllowRule, suggestions, agentID } = options;
    // A subagent of the session asking: the request says which.
    const from = subagents.labelOf(agentID);
    const by = from ? { subagent: from } : {};
    // The agent asks the user to choose: a card, not an approval.
    const asked = claudeQuestions(name, toolInput);
    if (asked && "refusal" in asked) return asked.refusal;
    if (asked) {
      const request = { id: toolUseID, name, questions: asked.questions, ...by };
      return questionResult(toolInput, await ask(request, AbortSignal.any([signal, turn()])));
    }
    // Claude says not to offer an always-allow for this call: Allow for this chat isn't offered either.
    const forChat = suppressAlwaysAllowRule !== true;
    const rules = forChat ? sessionRules(suggestions) : [];
    const suggested = suggestedRule(rules);
    const request = { id: toolUseID, name, input: toolInput, forChat, ...(suggested ? { suggested } : {}), ...by };
    const decision = await approve(request, AbortSignal.any([signal, turn()]));
    // Allow for this chat on Claude's suggestion hands back the very rules suggested: Claude applies them.
    const chosen = decision.allow && suggested !== null && decision.rule === suggested.rule;
    return decision.allow
      ? { behavior: "allow", updatedInput: decision.input, ...(chosen ? { updatedPermissions: rules } : {}) }
      : { behavior: "deny", message: decision.message, ...(decision.interrupt ? { interrupt: true } : {}) };
  };
}
