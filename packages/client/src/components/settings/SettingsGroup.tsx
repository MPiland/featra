import { useId, type ReactNode } from "react";

/** A card of setting rows; a title only where the page has more than one group. */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const id = useId();
  if (!title) return <div className="settings-group settings-card">{children}</div>;
  return (
    <section className="settings-group" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <div className="settings-card">{children}</div>
    </section>
  );
}
