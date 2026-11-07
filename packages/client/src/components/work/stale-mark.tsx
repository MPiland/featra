import { createContext, useContext } from "react";
import { WORK_COPY } from "../../work-list.ts";

/** The IDs of cards with a stale copy, so each row can carry the flag. */
export const StaleCards = createContext<ReadonlySet<string>>(new Set());

/** Flags a card's row when a copy of it was edited outside its owner. */
export function StaleMark({ id }: { id: string | null }) {
  const stale = useContext(StaleCards);
  if (id === null || !stale.has(id)) return null;
  return <span className="stale-mark">{WORK_COPY.staleMark}</span>;
}
