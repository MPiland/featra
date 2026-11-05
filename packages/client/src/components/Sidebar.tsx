import { VIEWS, type ViewDef, type ViewId } from "../views.ts";
import { ViewIcon } from "./icons.tsx";

export interface SidebarProps {
  collapsed: boolean;
  current: ViewId;
  onOpen: (view: ViewId) => void;
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
export function Sidebar({ collapsed, current, onOpen }: SidebarProps) {
  return (
    <nav id="sidebar" className="side" aria-label="Featra" inert={collapsed} data-collapsed={collapsed}>
      {/* STORY-19: the project switcher sits here, above New chat. */}
      {/* STORY-21: New chat. */}
      <NavList views={VIEWS.filter((v) => v.placement === "top")} current={current} onOpen={onOpen} />
      {/* STORY-21: the chat list, grouped by provider, fills this space. */}
      <div className="chats" />
      <NavList views={VIEWS.filter((v) => v.placement === "bottom")} current={current} onOpen={onOpen} />
    </nav>
  );
}
