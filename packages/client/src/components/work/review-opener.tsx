import { createContext, useContext } from "react";

/**
 * Opens a feature's review screen (STORY-69): Work provides it, for the Review button on an active feature's row and
 * on its card pane. Null where there is no review screen to open (a chat's docked pane): no Review button shows.
 */
export const OpenReview = createContext<((feature: string) => void) | null>(null);

export const useOpenReview = () => useContext(OpenReview);
