import type { ReactNode } from "react";
import { CHAT_COPY } from "../chats.ts";
import type { ProjectRef } from "../projects.ts";
import { VIEWS, type ViewDef, type ViewId } from "../views.ts";
import { ViewIcon } from "./icons.tsx";

export interface SidebarProps {
  collapsed: boolean;
  /** The view in front, or null while a chat is. */
  current: ViewId | null;
  onOpen: (view: ViewId) => void;
  /** The project switcher, at the top. */
  switcher: ReactNode;
  /** The project whose chats the list shows. */
  project: ProjectRef | null;
  /** Opens the role picker for a new chat in the project. */
  onNewChat: () => void;
}

function NavList({
  views,
  current,
  onOpen,
}: {
  views: ViewDef[];
  current: ViewId | null;
  onOpen: (v: ViewId) => void;
}) {
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
export function Sidebar({ collapsed, current, onOpen, switcher, project, onNewChat }: SidebarProps) {
  return (
    <nav id="sidebar" className="side" aria-label="Featra" inert={collapsed} data-collapsed={collapsed}>
      {switcher}
      <button type="button" className="new-chat" disabled={!project} onClick={onNewChat}>
        {CHAT_COPY.newChat}
      </button>
      <NavList views={VIEWS.filter((v) => v.placement === "top")} current={current} onOpen={onOpen} />
      {/* STORY-21: the chat list, grouped by provider, fills this space. */}
      <section key={project?.dir} className="chats" aria-label="Chats" data-project={project?.dir} />
      <NavList views={VIEWS.filter((v) => v.placement === "bottom")} current={current} onOpen={onOpen} />
    </nav>
  );
}
