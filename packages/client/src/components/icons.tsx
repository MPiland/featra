import type { ReactNode } from "react";
import type { ViewId } from "../views.ts";

/** Stroke icons from the approved mockup (docs/mockups/app.html). Decorative: the control carries the label. */
function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg className="i" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const MenuIcon = () => (
  <Icon>
    <path d="M4 6h16M4 12h12M4 18h8" />
  </Icon>
);
export const SidebarIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M9 5v14" />
  </Icon>
);
export const BackIcon = () => (
  <Icon>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);
export const ForwardIcon = () => (
  <Icon>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);
export const ChevronRightIcon = () => (
  <Icon size={14}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);
export const CheckIcon = () => (
  <Icon size={14}>
    <path d="M5 12l5 5 9-10" />
  </Icon>
);
export const MinimizeIcon = () => (
  <Icon>
    <path d="M6 12h12" />
  </Icon>
);
export const MaximizeIcon = () => (
  <Icon>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

const viewPaths: Record<ViewId, ReactNode> = {
  work: <path d="M4 6h16M4 12h16M4 18h10" />,
  inbox: <path d="M4 13l2-8h12l2 8v6H4zM4 13h5l1 2h4l1-2h5" />,
  artifacts: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  plugins: <path d="M9 4h6v4a2 2 0 1 1 0 0M4 9h4a2 2 0 1 1 0 0v6H4zM9 20v-4a2 2 0 1 0 0 0h6v4zM20 9v6h-4" />,
  settings: (
    <g>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </g>
  ),
};

export function ViewIcon({ view, size }: { view: ViewId; size?: number }) {
  return <Icon size={size ?? 16}>{viewPaths[view]}</Icon>;
}
