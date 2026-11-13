/**
 * The Dev Lead's `request_merge` (STORY-12, ADR 0034): it asks, the user decides. Only the chat that started the story
 * may ask, and only for a story that could merge now. The ask is an approval card in the Dev Lead's chat and the
 * Inbox; the call answers at once, and how it ends (declined, merged, or not merged and why) reaches the Dev Lead as a
 * notice, so it never waits on the user.
 */
import {
  mergeRefusal,
  MERGE_MESSAGES,
  REQUEST_MERGE_MESSAGES,
  REQUEST_MERGE_TOOL,
  type Notice,
  type RequestMergeInput,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { ownedIn } from "./card-actions.ts";
import type { ChatManager } from "./chat-manager.ts";
import { featureBranchOf } from "./merge-settle.ts";
import { keyOf } from "./story-prs-seen.ts";
import type { StoryMerge } from "./story-merge.ts";
import type { Scan } from "./work-scan.ts";

export interface MergeRequestDeps {
  scan: (dir: string) => Promise<Scan | null>;
  chats: Pick<ChatManager, "storySession" | "list" | "askApproval" | "notify">;
  merge: StoryMerge["merge"];
  log: (message: string) => void;
}

export function createMergeRequest({ scan: scanDir, chats, merge, log }: MergeRequestDeps) {
  const waiting = new Set<string>();
  let asks = 0;

  /** The user's answer, then the merge it allows, told to the Dev Lead as a notice. */
  async function decide(dir: string, story: string, into: string, lead: string) {
    const ask = { id: `merge-${++asks}-${Date.now()}`, name: REQUEST_MERGE_TOOL, input: { story, into }, story };
    let notice: Notice;
    try {
      if (!(await chats.askApproval(lead, ask))) {
        notice = { story, outcome: "merge declined", summary: "" };
      } else {
        const { remains } = await merge(dir, story);
        notice = { story, outcome: "merged", summary: [`${into}.`, ...remains].join(" ") };
      }
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      notice = { story, outcome: "not merged", summary: why };
    } finally {
      waiting.delete(keyOf(dir, story));
    }
    try {
      chats.notify(lead, notice);
    } catch (err) {
      log(
        `The Dev Lead couldn't be told how ${story}'s merge went: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    /** Asks the user to merge `input.story`, on behalf of the chat `lead`; answers once the user has been asked. */
    async request(dir: string, input: RequestMergeInput, lead: string): Promise<{ story: string }> {
      const { story } = input;
      const scan = await scanDir(dir);
      const found = ownedIn(scan, story);
      const config = scan?.collected.config;
      if (!scan || !config) throw new ApiError(MERGE_MESSAGES.gone);
      const refusal = mergeRefusal(found?.owned, story, config, found?.root != null);
      if (refusal !== null) throw new ApiError(refusal);
      const session = chats.storySession(dir, story);
      const row = session === null ? undefined : chats.list(dir).find((c) => c.id === session);
      if (!row || row.story?.parent !== lead) throw new ApiError(REQUEST_MERGE_MESSAGES.notLead(story));
      const into = featureBranchOf(scan, found?.owned.card);
      if (!into) throw new ApiError(MERGE_MESSAGES.noFeature(story));
      const key = keyOf(dir, story);
      if (waiting.has(key)) throw new ApiError(REQUEST_MERGE_MESSAGES.waiting(story));
      waiting.add(key);
      void decide(dir, story, into, lead);
      return { story };
    },
  };
}

export type MergeRequest = ReturnType<typeof createMergeRequest>;
