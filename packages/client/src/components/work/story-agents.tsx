import { createContext, useContext } from "react";
import { canResume, isStartable } from "@featra/work-format";
import type { StoryRow } from "@featra/work-format/work-list";
import type { StartStoryResult } from "../../card-pane.ts";
import { WORK_COPY } from "../../work-list.ts";
import { StoryStop, type StopActions } from "./StoryStop.tsx";
import { useAction } from "./useAction.ts";

/** What a story row needs to start the story's agent and to show it (STORY-9). */
export interface StoryAgents {
  /** The story as the list has it, and whether its feature is started (only then can it be started). */
  row: (id: string) => { story: StoryRow; featureActive: boolean } | null;
  /** The story's session waiting for a free slot, if there is one. */
  queued: (id: string) => boolean;
  /** Whether the story's session has a turn running (STORY-53). */
  running: (id: string) => boolean;
  /** Whether the story's idle session ended without finishing: a failure, a question or a restart (STORY-53). */
  stalled: (id: string) => boolean;
  /** Whether the project still has the chat. */
  hasChat: (chat: string) => boolean;
  start: (id: string) => Promise<StartStoryResult>;
  open: (chat: string) => void;
  stops: StopActions;
}

const NONE: StoryAgents = {
  row: () => null,
  queued: () => false,
  hasChat: () => false,
  start: async () => ({ ok: false, error: "" }),
  open: () => {},
  running: () => false,
  stalled: () => false,
  stops: { stop: async () => ({ ok: true }), resume: async () => ({ ok: true }) },
};

export const StoryAgentsContext = createContext<StoryAgents>(NONE);

/**
 * A story's agent in its row or its card pane: Start on a New or Ready story of a started feature (no confirmation: it
 * only makes a worktree), Queued while it waits for a slot, and once started the agent, its model and a link that opens
 * the session. A refusal shows in one sentence under the button and the button stays.
 */
export function StoryAgent({ id }: { id: string }) {
  const agents = useContext(StoryAgentsContext);
  const { busy, error, run } = useAction();
  const row = agents.row(id);
  if (!row) return null;
  const { story, featureActive } = row;

  const stop = (
    <StoryStop
      id={id}
      state={{
        stopped: story.stopped,
        resumable: canResume(story.stopped, agents.stalled(id), story.tone),
        active: agents.running(id) || agents.queued(id),
      }}
      actions={agents.stops}
    />
  );
  if (agents.queued(id)) {
    return (
      <span className="story-agent meta">
        <span role="status">{WORK_COPY.queued}</span> {stop}
      </span>
    );
  }
  if (featureActive && isStartable(story.stage)) {
    return (
      <span className="story-agent">
        <button
          type="button"
          className="review-draft"
          disabled={busy}
          aria-label={WORK_COPY.startOf(id)}
          onClick={() => void run(() => agents.start(id))}
        >
          {WORK_COPY.start}
        </button>
        {error && (
          <span className="card-error" role="alert">
            {error}
          </span>
        )}
      </span>
    );
  }
  if (!story.agent) return null;
  return (
    <span className="story-agent meta">
      {[story.agent, story.model].filter(Boolean).join(" · ")}
      {story.session !== null && agents.hasChat(story.session) && (
        <>
          {" · "}
          <button
            type="button"
            className="review-draft"
            aria-label={WORK_COPY.openSessionOf(id)}
            onClick={() => agents.open(story.session ?? "")}
          >
            {WORK_COPY.openSession}
          </button>
        </>
      )}{" "}
      {stop}
    </span>
  );
}
