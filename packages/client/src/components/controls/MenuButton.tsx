import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { MenuNode } from "../../menu.ts";
import { focusedElement, isInside } from "../../utils/dom.ts";
import { MenuList } from "./MenuList.tsx";

export interface MenuButtonProps {
  /** The menu's id; the button points at it while it is open. */
  id: string;
  /** The button's accessible name, and the menu's unless `menuLabel` is given. */
  label: string;
  menuLabel?: string;
  nodes: readonly MenuNode[];
  /** The button's class; "on" is added while the menu is open. */
  className: string;
  /** Extra class for the top-level menu (its size and position). */
  menuClassName?: string;
  /** The tooltip, if any. */
  tip?: string;
  /** What the button shows. */
  children: ReactNode;
}

/**
 * A button that opens a menu, with cascading submenus (WAI-ARIA menu button pattern).
 * Keyboard: Up/Down/Home/End move, Right/Enter/Space open a submenu, Left closes it, Enter/Space run an item,
 * Escape steps back one level (and from the top, closes and refocuses the button), Tab closes.
 * Mouse: hovering an item focuses it and opens its submenu.
 */
export function MenuButton({ id, label, menuLabel, nodes, className, menuClassName, tip, children }: MenuButtonProps) {
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

  const byId = (itemId: string) =>
    root.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(itemId)}"]`) ?? null;

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

  const openSub = (depth: number, subId: string, focusFirst: boolean) => {
    setPath((p) => [...p.slice(0, depth), subId]);
    if (focusFirst) {
      const sub = findSub(nodes, subId);
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
        className={open ? `${className} on` : className}
        aria-label={label}
        data-tip={tip}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
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
        {children}
      </button>
      {open && (
        // Catches keys bubbling up from the menus below; the menus carry the roles.
        <div ref={root} role="presentation" onKeyDown={onKey}>
          <MenuList
            id={id}
            label={menuLabel ?? label}
            className={menuClassName}
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
