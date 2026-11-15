import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { CloseIcon } from "../icons.tsx";

export interface DockedAsideProps {
  /** The pane's element id, which the opener's `aria-controls` names. */
  paneId: string;
  /** The pane's accessible name. */
  label: string;
  /** The id shown at the start of the pane's bar. */
  id: string;
  /** Buttons in the bar, before Close. */
  actions?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  /** Take focus on open (default). A pane that opens beside a chat being typed in leaves it. */
  focusOnOpen?: boolean;
  /** In CSS px: chosen by the handle beside it, fitted to the work area. */
  width: number;
  /** The pane's own element, for a host that moves focus back into it. */
  paneRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * The frame of a pane docked on the right (ADR 0017): the card pane's and the feature progress pane's. It takes focus
 * when it opens (it is mounted once per thing it shows), and Escape closes it unless something inside is using Escape.
 * Its bar holds the id, the host's actions and Close.
 */
export function DockedAside(props: DockedAsideProps) {
  const { paneId, label, id, actions, closeLabel, onClose, focusOnOpen = true, width, paneRef, children } = props;
  const own = useRef<HTMLElement>(null);
  const pane = paneRef ?? own;
  useEffect(() => {
    if (focusOnOpen) pane.current?.focus();
  }, [focusOnOpen, pane]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    onClose();
  };
  return (
    // The pane takes focus on open so Escape reaches it; it isn't a stop in the Tab order.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <aside
      id={paneId}
      ref={pane}
      className="card-pane"
      style={{ width }}
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKey}
    >
      <div className="card-bar">
        <span className="card-id">{id}</span>
        <span className="pane-actions">
          {actions}
          <button type="button" className="card-close" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
            <CloseIcon />
          </button>
        </span>
      </div>
      {children}
    </aside>
  );
}
