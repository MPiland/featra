import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { MenuNode } from "../menu.ts";
import { focusedElement, isInside } from "../utils/dom.ts";
import { CheckIcon, ChevronRightIcon, MenuIcon } from "./icons.tsx";

/**
 * The title bar's Menu button and its cascading menus (WAI-ARIA menu button pattern).
 * Keyboard: Up/Down/Home/End move, Right/Enter/Space open a submenu, Left closes it, Enter/Space run an item,
 * Escape steps back one level (and from the top, closes and refocuses the button), Tab closes.
 * Mouse: hovering an item focuses it and opens its submenu.
 */
export function AppMenu({ nodes }: { nodes: readonly MenuNode[] }) {
  const [open, setOpen] = useState(false);
  /** Ids of the open submenus, outermost first. */
  const [path, setPath] = useState<string[]>([]);
  const button = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  /** Item to focus after the next render. */
  const focusNext = useRef<string | null>(null);
  /** Where focus goes back to when an item runs: the field the user was in, so Edit commands act on it. */
  const returnTo = useRef<HTMLElement | null>(null);
  const pointerOpener = useRef<HTMLElement | null>(null);

  const byId = (id: string) => root.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`) ?? null;

  useLayoutEffect(() => {
    if (!open || focusNext.current === null) return;
    byId(focusNext.current)?.focus();
    focusNext.current = null;
  });

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: PointerEvent) => {
      if (isInside(e.target, root.current, button.current)) return;
      setOpen(false);
      setPath([]);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const openMenu = () => {
    returnTo.current = pointerOpener.current ?? button.current;
    pointerOpener.current = null;
    focusNext.current = nodes[0]?.id ?? null;
    setPath([]);
    setOpen(true);
  };

  function closeAll(refocusButton: boolean) {
    setOpen(false);
    setPath([]);
    if (refocusButton) button.current?.focus();
  }

  const run = (node: Extract<MenuNode, { onSelect: () => void }>) => {
    const target = returnTo.current;
    closeAll(false);
    if (target?.isConnected) target.focus();
    else button.current?.focus();
    node.onSelect();
  };

  const openSub = (depth: number, id: string, focusFirst: boolean) => {
    setPath((p) => [...p.slice(0, depth), id]);
    if (focusFirst) {
      const sub = findSub(nodes, id);
      const first = sub?.items.find((n) => n.kind !== "separator");
      focusNext.current = first?.id ?? null;
    }
  };

  /** Closes the submenu at `depth` and puts focus back on the item that opened it. */
  const closeSub = (depth: number) => {
    const parentItem = path[depth - 1];
    setPath((p) => p.slice(0, depth - 1));
    if (parentItem) byId(parentItem)?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    const item = focusedElement()?.closest<HTMLElement>("[data-id]");
    const list = item?.closest<HTMLElement>("[role=menu]");
    const itemId = item?.dataset.id;
    if (!item || !list || !itemId) return;
    const depth = Number(list.dataset.depth);
    const node = findNode(nodes, itemId);
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-id]")).filter(
      (el) => el.closest("[role=menu]") === list,
    );
    const at = items.indexOf(item);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();

    switch (e.key) {
      case "ArrowDown":
        focusAt(at + 1);
        break;
      case "ArrowUp":
        focusAt(at - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(items.length - 1);
        break;
      case "ArrowRight":
        if (node?.kind !== "submenu") return;
        openSub(depth, node.id, true);
        break;
      case "ArrowLeft":
        if (depth === 0) return;
        closeSub(depth);
        break;
      case "Escape":
        if (depth === 0) closeAll(true);
        else closeSub(depth);
        break;
      case "Tab":
        closeAll(false);
        return; // let Tab move focus on
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="menuwrap">
      <button
        ref={button}
        type="button"
        className={open ? "tb on" : "tb"}
        aria-label="Menu"
        data-tip="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "app-menu" : undefined}
        onPointerDown={() => {
          if (!open) pointerOpener.current = focusedElement();
        }}
        onClick={() => (open ? closeAll(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openMenu();
          }
        }}
      >
        <MenuIcon />
      </button>
      {open && (
        // Catches keys bubbling up from the menus below; the menus carry the roles.
        <div ref={root} role="presentation" onKeyDown={onKey}>
          <MenuList
            id="app-menu"
            label="Menu"
            nodes={nodes}
            depth={0}
            path={path}
            onRun={run}
            onOpenSub={openSub}
            onHoverLeaf={(depth) => setPath((p) => p.slice(0, depth))}
          />
        </div>
      )}
    </div>
  );
}

interface MenuListProps {
  id?: string;
  label: string;
  nodes: readonly MenuNode[];
  depth: number;
  path: readonly string[];
  onRun: (node: Extract<MenuNode, { onSelect: () => void }>) => void;
  onOpenSub: (depth: number, id: string, focusFirst: boolean) => void;
  onHoverLeaf: (depth: number) => void;
}

function MenuList(p: MenuListProps) {
  return (
    <div
      id={p.id}
      className={p.depth === 0 ? "menu top" : "menu sub"}
      role="menu"
      aria-label={p.label}
      data-depth={p.depth}
    >
      {p.nodes.map((node) => {
        if (node.kind === "separator") return <hr key={node.id} className="msep" />;
        const hover = (e: MouseEvent<HTMLButtonElement>) => {
          e.currentTarget.focus();
          if (node.kind === "submenu") p.onOpenSub(p.depth, node.id, false);
          else p.onHoverLeaf(p.depth);
        };
        if (node.kind === "submenu") {
          const expanded = p.path[p.depth] === node.id;
          return (
            <div key={node.id} role="none" className="mwrap">
              <button
                type="button"
                role="menuitem"
                className={expanded ? "mi open" : "mi"}
                tabIndex={-1}
                data-id={node.id}
                aria-haspopup="menu"
                aria-expanded={expanded}
                onMouseEnter={hover}
                // A keyboard click (Enter/Space, detail 0) moves into the submenu; a mouse click just opens it.
                onClick={(e) => p.onOpenSub(p.depth, node.id, e.detail === 0)}
              >
                {node.label}
                <span className="k chev">
                  <ChevronRightIcon />
                </span>
              </button>
              {expanded && <MenuList {...p} id={undefined} label={node.label} nodes={node.items} depth={p.depth + 1} />}
            </div>
          );
        }
        return (
          <div key={node.id} role="none">
            {/* A disabled item stays focusable, so arrowing through the menu still finds it (WAI-ARIA). */}
            <button
              type="button"
              role={node.kind === "check" ? "menuitemcheckbox" : "menuitem"}
              aria-checked={node.kind === "check" ? node.checked : undefined}
              aria-disabled={node.kind === "item" && node.disabled ? true : undefined}
              className="mi"
              tabIndex={-1}
              data-id={node.id}
              onMouseEnter={hover}
              onClick={() => {
                if (!(node.kind === "item" && node.disabled)) p.onRun(node);
              }}
            >
              {node.kind === "check" && <span className="mcheck">{node.checked && <CheckIcon />}</span>}
              {node.label}
              {node.shortcut && <span className="k">{node.shortcut}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function findNode(nodes: readonly MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.kind === "submenu") {
      const found = findNode(n.items, id);
      if (found) return found;
    }
  }
  return undefined;
}

function findSub(nodes: readonly MenuNode[], id: string) {
  const n = findNode(nodes, id);
  return n?.kind === "submenu" ? n : undefined;
}
