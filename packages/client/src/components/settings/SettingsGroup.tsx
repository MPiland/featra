import { useId, type ReactNode } from "react";

/** A card of setting rows; a title only where the page has more than one group. A page with sections nests it (h4). */
export function SettingsGroup(props: { title?: string; level?: 3 | 4; children: ReactNode }) {
  const { title, level = 3, children } = props;
  const id = useId();
  const Heading = level === 4 ? "h4" : "h3";
  if (!title) return <div className="settings-group settings-card">{children}</div>;
  return (
    <section className="settings-group" aria-labelledby={id}>
      <Heading id={id}>{title}</Heading>
      <div className="settings-card">{children}</div>
    </section>
  );
}
