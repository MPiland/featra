import type { ReactNode } from "react";

/** A Settings page's title, with anything that belongs beside it (the Project page's picker). */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  // A div, not a <header>: inside the page a header would be a second banner landmark.
  return (
    <div className="settings-header">
      <h2 id="settings-page-title">{title}</h2>
      {children}
    </div>
  );
}
