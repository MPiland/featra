import { createContext, useContext } from "react";

/** Which card or feature progress the pane shows, and how a row opens either. */
export interface CardSelection {
  selected: string | null;
  paneId: string;
  open: (id: string) => void;
  /** The feature whose progress the pane shows (STORY-24). */
  progress?: string | null;
  /** Opens a feature's progress in the pane. */
  openProgress?: (feature: string) => void;
  /** Closes the pane, as its close button does: a row's button that opened it closes it on a second click. */
  close?: () => void;
}

export const SelectedCard = createContext<CardSelection>({ selected: null, paneId: "", open: () => {} });

export const useCardSelection = () => useContext(SelectedCard);
