import { createContext, useContext } from "react";

/** Opens the chat that drafted a feature, with its draft pane: what a draft's row in Work offers (STORY-49). */
export const ReviewDraft = createContext<(chat: string) => void>(() => {});

export const useReviewDraft = () => useContext(ReviewDraft);
