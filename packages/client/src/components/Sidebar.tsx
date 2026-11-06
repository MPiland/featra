import type { ReactNode } from "react";
import type { ProjectRef } from "../projects.ts";
import { VIEWS, type ViewDef, type ViewId } from "../views.ts";
import { ViewIcon } from "./icons.tsx";

export interface SidebarProps {
  collapsed: boolean;
  current: ViewId;
  onOpen: (view: ViewId) => void;
  /** The project switcher, at the top. */
  switcher: ReactNode;
  /** The project whose chats the list shows. */
  project: ProjectRef | null;
}

function NavList({ views, current, onOpen }: { views: ViewDef[]; current: ViewId; onOpen: (v: ViewId) => void }) {
  return (
    <ul className="navlist">
      {views.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            className={v.id === current ? "nav on" : "nav"}
            aria-current={v.id === current ? "page" : undefined}
            onClick={() => onOpen(v.id)}
          >
            <ViewIcon view={v.id} />
            {v.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A collapsed sidebar is `inert`: out of the tab order and hidden from assistive tech, not just squeezed to 0px. */
export function Sidebar({ collapsed, current, onOpen, switcher, project }: SidebarProps) {
  return (
    <nav id="sidebar" className="side" aria-label="Featra" inert={collapsed} data-collapsed={collapsed}>
      {switcher}
      {/* STORY-21: New chat. */}
      <NavList views={VIEWS.filter((v) => v.placement === "top")} current={current} onOpen={onOpen} />
      {/* STORY-21: the chat list, grouped by provider, fills this space. */}
      <section key={project?.dir} className="chats" aria-label="Chats" data-project={project?.dir} />
      <NavList views={VIEWS.filter((v) => v.placement === "bottom")} current={current} onOpen={onOpen} />
    </nav>
  );
}
