import { createContext, useContext, useMemo, useState } from "react";

/** Which features of the list are open, by feature ID ("none" for the stories with no feature). */
export interface OpenFeatures {
  has: (id: string | null) => boolean;
  toggle: (id: string | null) => void;
}

const keyOf = (id: string | null) => id ?? "none";

/**
 * Kept by the list, not by each feature row (BUG-25): a row is remounted when a list update blanks it for a moment, or
 * a filter chip changes, and the user's open features must stay open. Like the filter, it lasts as long as the list.
 */
export const OpenFeaturesContext = createContext<OpenFeatures>({ has: () => false, toggle: () => {} });

/** The list's open features, all closed at first. */
export function useOpenFeatures(): OpenFeatures {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  return useMemo(
    () => ({
      has: (id) => open.has(keyOf(id)),
      toggle: (id) =>
        setOpen((was) => {
          const next = new Set(was);
          if (!next.delete(keyOf(id))) next.add(keyOf(id));
          return next;
        }),
    }),
    [open],
  );
}

/** Whether this feature is open, and how to open or close it. */
export function useFeatureOpen(id: string | null): [boolean, () => void] {
  const features = useContext(OpenFeaturesContext);
  return [features.has(id), () => features.toggle(id)];
}
