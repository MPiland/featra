/**
 * The Featra MCP calls only the Dev Lead's chat may make, never a story session's: messaging a story's session
 * (STORY-54), proposing a check command (STORY-56), asking the user to merge a story (STORY-12), and reporting a bug for
 * the user to place (STORY-13), and writing a feature's summary for its review screen (STORY-69). Only the summary
 * writes a card, the feature's own; only the MCP's off switch applies (the read-only setting withholds the whole MCP at
 * `attach` anyway).
 */
import { parseBugReport, parseMessageInput, parseRequestMergeInput, parseSummaryInput } from "@featra/work-format";
import { AGENT_MESSAGES } from "./agent-messages.ts";
import { ApiError } from "./api-error.ts";
import type { BugRequest } from "./bug-request.ts";
import { proposeChecks } from "./check-propose.ts";
import type { CheckSettings } from "./check-settings.ts";
import type { FeatureSummaryWriter } from "./feature-summary.ts";
import type { MergeRequest } from "./merge-request.ts";
import type { StoryMessage } from "./story-message.ts";

export interface LeadCallDeps {
  /** Why the MCP is off for the project, or null when it is on. */
  mcpRefusal: (dir: string) => Promise<string | null>;
  /** Sends the Dev Lead's messages to story sessions (STORY-54). Without it `session.message` is refused. */
  messages?: StoryMessage;
  /** Keeps the Dev Lead's check-command proposals for the user to confirm (STORY-56). Without it `checks.propose` is refused. */
  checkSettings?: Pick<CheckSettings, "propose">;
  /** Asks the user to merge a story for the Dev Lead (STORY-12). Without it `story.requestMerge` is refused. */
  merges?: MergeRequest;
  /** Asks the user to place a bug the Dev Lead reports (STORY-13). Without it `bug.report` is refused. */
  bugs?: BugRequest;
  /** Writes the Dev Lead's summary of a feature (STORY-69). Without it `feature.summary` is refused. */
  summaries?: FeatureSummaryWriter;
}

export function createLeadCalls({ mcpRefusal, messages, checkSettings, merges, bugs, summaries }: LeadCallDeps) {
  /** Refuses a story session with `sessionRefusal`, and any chat when the MCP is off. */
  async function lead(dir: string, story: boolean | undefined, sessionRefusal: string) {
    if (story) throw new ApiError(sessionRefusal);
    const off = await mcpRefusal(dir);
    if (off !== null) throw new ApiError(off);
  }

  return {
    async message(chat: string, dir: string, story: boolean | undefined, params: unknown) {
      await lead(dir, story, AGENT_MESSAGES.sessionMessage);
      if (!messages) throw new ApiError(AGENT_MESSAGES.noMessage);
      const input = parseMessageInput(params);
      if (!input.ok) throw new ApiError(input.error);
      return messages.send(dir, input.value, chat);
    },

    async propose(dir: string, story: boolean | undefined, params: unknown) {
      await lead(dir, story, AGENT_MESSAGES.sessionPropose);
      if (!checkSettings) throw new ApiError(AGENT_MESSAGES.noPropose);
      return proposeChecks(checkSettings, dir, params);
    },

    async requestMerge(chat: string, dir: string, story: boolean | undefined, params: unknown) {
      await lead(dir, story, AGENT_MESSAGES.sessionMerge);
      if (!merges) throw new ApiError(AGENT_MESSAGES.noMerge);
      const input = parseRequestMergeInput(params);
      if (!input.ok) throw new ApiError(input.error);
      return merges.request(dir, input.value, chat);
    },

    async reportBug(chat: string, dir: string, story: boolean | undefined, params: unknown) {
      await lead(dir, story, AGENT_MESSAGES.sessionBug);
      if (!bugs) throw new ApiError(AGENT_MESSAGES.noBug);
      const input = parseBugReport(params);
      if (!input.ok) throw new ApiError(input.error);
      return bugs.report(dir, input.value, chat);
    },

    async summarize(chat: string, dir: string, story: boolean | undefined, params: unknown) {
      await lead(dir, story, AGENT_MESSAGES.sessionSummary);
      if (!summaries) throw new ApiError(AGENT_MESSAGES.noSummary);
      const input = parseSummaryInput(params);
      if (!input.ok) throw new ApiError(input.error);
      return summaries.write(dir, input.value, chat);
    },
  };
}
