import type { ReactNode } from "react";
import { CHAT_COPY } from "../chats.ts";
import { INBOX_COPY } from "../inbox.ts";
import type { ProjectRef } from "../projects.ts";
import { VIEWS, type ViewDef, type ViewId } from "../views.ts";
import { shortcutLabel } from "../shortcuts.ts";
import { PlusIcon, ViewIcon } from "./icons.tsx";

export interface SidebarProps {
  collapsed: boolean;
  /** The view in front, or null while a chat is. */
  current: ViewId | null;
  onOpen: (view: ViewId) => void;
  /** The project switcher, at the top. */
  switcher: ReactNode;
  /** The project whose chats the list shows. */
  project: ProjectRef | null;
  /** The host platform, for the shortcut the New chat row shows on hover. */
  platform: string;
  /** Opens the role picker for a new chat in the project. */
  onNewChat: () => void;
  /** The project's chat list (STORY-21), between the top views and the foot. */
  chats: ReactNode;
  /** How many are waiting in a view, shown beside its name (the Inbox, STORY-7). Zero shows nothing. */
  counts?: Partial<Record<ViewId, number>>;
}

const NO_COUNTS: Record<string, number> = {};

function NavList({
  views,
  current,
  onOpen,
  counts = NO_COUNTS,
}: {
  views: ViewDef[];
  current: ViewId | null;
  onOpen: (v: ViewId) => void;
  counts?: Partial<Record<ViewId, number>>;
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
            {(counts[v.id] ?? 0) > 0 && (
              <span className="nav-count" data-count={counts[v.id]}>
                <span aria-hidden="true">{counts[v.id]}</span>
                <span className="sr-only">{`, ${counts[v.id]} ${INBOX_COPY.waiting}`}</span>
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A collapsed sidebar is `inert`: out of the tab order and hidden from assistive tech, not just squeezed to 0px. */
export function Sidebar({
  collapsed,
  current,
  onOpen,
  switcher,
  project,
  platform,
  onNewChat,
  chats,
  counts,
}: SidebarProps) {
  return (
    <nav id="sidebar" className="side" aria-label="Featra" inert={collapsed} data-collapsed={collapsed}>
      {switcher}
      <ul className="navlist">
        <li>
          <button
            type="button"
            className="nav new-chat"
            disabled={!project}
            data-shortcut={shortcutLabel("newChat", platform)}
            onClick={onNewChat}
          >
            <PlusIcon />
            {CHAT_COPY.newChat}
          </button>
        </li>
      </ul>
      <NavList views={VIEWS.filter((v) => v.placement === "top")} current={current} onOpen={onOpen} counts={counts} />
      <section key={project?.dir} className="chats" aria-label={CHAT_COPY.chats} data-project={project?.dir}>
        {chats}
      </section>
      <NavList views={VIEWS.filter((v) => v.placement === "bottom")} current={current} onOpen={onOpen} />
    </nav>
  );
}
