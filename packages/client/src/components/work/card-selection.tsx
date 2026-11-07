import { createContext, useContext } from "react";

/** Which card the pane shows, and how a story row opens it. */
export interface CardSelection {
  selected: string | null;
  paneId: string;
  open: (id: string) => void;
}

export const SelectedCard = createContext<CardSelection>({ selected: null, paneId: "", open: () => {} });

export const useCardSelection = () => useContext(SelectedCard);
