/**
 * What merging a story says (STORY-12), kept apart from the rules so the client reads it without them. Short,
 * sentence case, and the same words in the card pane, the Work row and the Dev Lead's request card.
 */

/** The approval the Dev Lead's `request_merge` puts in its chat: the tool row's name. */
export const REQUEST_MERGE_TOOL = "request_merge";

export const MERGE_COPY = {
  merge: "Merge",
  merging: "Merging…",
  decline: "Decline",
  merged: "Merged",
  /** The request card's question. */
  ask: (story: string, into: string) => `Merge ${story} into ${into}?`,
  /** The request card's line about who asks. */
  asked: "The Dev Lead asks to merge this story.",
} as const;
